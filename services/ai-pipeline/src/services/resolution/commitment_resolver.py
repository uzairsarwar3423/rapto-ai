"""
services/resolution/commitment_resolver.py
────────────────────────────────────────────────────────────────────────────────
Vocaply AI Pipeline — Commitment Resolver Service
Day 53 | Principal Engineer Edition

Implements the model-free, owner-partitioned commitment similarity resolver.
"""

from __future__ import annotations

import logging
import time
from typing import Dict, List, Set, Tuple

from src.config.resolution_config import (
    MATCH_THRESHOLD,
    MAX_HISTORICAL_POOL_SIZE,
    OWNER_MATCH_NAME_MIN_CHARS,
    SCORE_BOOST_FOR_PREFIX_MATCH,
    UNKNOWN_SPEAKER_MARKER,
)
from src.models.exceptions import ResolverInvariantError
from src.models.resolution_models import (
    HistoricalCommitment,
    MatchCandidate,
    MatchedCommitment,
    ResolutionInput,
    ResolutionResult,
    ResolutionStats,
)
from src.services.extraction.commitment_parser import normalize_text, ParsedCommitment
from src.services.similarity import has_prefix_match, similarity_score

logger = logging.getLogger(__name__)


def resolve(payload: ResolutionInput) -> ResolutionResult:
    """Resolve newly extracted commitments against active historical commitments.

    Uses owner-scoped partitioning, hybrid Cosine + Jaccard similarity, prefix boosting,
    and a double-match conflict retention policy.
    """
    start_time = time.monotonic()
    data_quality_warnings: List[str] = []

    # ─── STEP 1: Pre-processing & Filters ──────────────────────────────────────

    # Defensive check for same-meeting exclusion
    historical_pool: List[HistoricalCommitment] = []
    for hc in payload.historical_commitments:
        if hc.meeting_id == payload.meeting_id:
            warning_msg = (
                f"Defensive safeguard: historical commitment {hc.id} belongs "
                f"to current meeting {payload.meeting_id}. Excluded."
            )
            logger.warning(warning_msg)
            data_quality_warnings.append(warning_msg)
        elif hc.status not in ("PENDING", "DEFERRED"):
            warning_msg = (
                f"Defensive safeguard: historical commitment {hc.id} has invalid "
                f"status '{hc.status}'. Excluded."
            )
            logger.warning(warning_msg)
            data_quality_warnings.append(warning_msg)
        else:
            historical_pool.append(hc)

    # Initialize results structures
    result_new: List[ParsedCommitment] = []
    result_matched: List[MatchedCommitment] = []
    result_unchanged_ids: Set[str] = {hc.id for hc in historical_pool}

    total_comparisons = 0
    pool_truncations = 0
    owner_fallbacks = 0

    # ─── STEP 2: Owner-scoped Partitioning ─────────────────────────────────────

    # Group historical commitments by owner_id
    hist_by_owner_id_temp: Dict[str, List[HistoricalCommitment]] = {}
    for hc in historical_pool:
        hist_by_owner_id_temp.setdefault(hc.owner_id, []).append(hc)

    historical_by_owner_id: Dict[str, List[HistoricalCommitment]] = {}
    historical_by_owner_name: Dict[str, List[HistoricalCommitment]] = {}

    for owner_id, hc_list in hist_by_owner_id_temp.items():
        # Sort descending by created_at (most recent first)
        hc_list.sort(key=lambda x: x.created_at, reverse=True)

        # Apply MAX_HISTORICAL_POOL_SIZE truncation
        if len(hc_list) > MAX_HISTORICAL_POOL_SIZE:
            pool_truncations += 1
            warning_msg = (
                f"Historical pool for owner_id {owner_id} truncated "
                f"from {len(hc_list)} to {MAX_HISTORICAL_POOL_SIZE}."
            )
            logger.warning(warning_msg)
            data_quality_warnings.append(warning_msg)
            hc_list = hc_list[:MAX_HISTORICAL_POOL_SIZE]

        historical_by_owner_id[owner_id] = hc_list

        # Register under owner_name for fallback matching
        unique_names = {hc.owner_name.lower().strip() for hc in hc_list}
        for name_key in unique_names:
            if (
                name_key != UNKNOWN_SPEAKER_MARKER
                and len(name_key) >= OWNER_MATCH_NAME_MIN_CHARS
            ):
                if name_key in historical_by_owner_name:
                    # Name collision across different user_ids: merge and sort/truncate
                    existing = historical_by_owner_name[name_key]
                    merged = list({x.id: x for x in (existing + hc_list)}.values())
                    merged.sort(key=lambda x: x.created_at, reverse=True)
                    historical_by_owner_name[name_key] = merged[:MAX_HISTORICAL_POOL_SIZE]
                else:
                    historical_by_owner_name[name_key] = hc_list

    # Group new commitments by owner key
    new_by_owner: Dict[str, List[Tuple[ParsedCommitment, bool]]] = {}
    for nc in payload.new_commitments:
        new_uid = nc.speaker_user_id or nc.owner_user_id
        new_name = nc.speaker_name or nc.owner_name

        owner_key = None
        is_fallback = False

        if new_uid and new_uid.strip():
            owner_key = new_uid.strip()
        elif new_name and new_name.strip():
            name_stripped = new_name.lower().strip()
            if (
                name_stripped != UNKNOWN_SPEAKER_MARKER
                and len(name_stripped) >= OWNER_MATCH_NAME_MIN_CHARS
            ):
                owner_key = name_stripped
                is_fallback = True

        if owner_key is None:
            # Cannot owner-match: classify immediately as new
            result_new.append(nc)
            warning_msg = (
                f"New commitment lacks resolvable owner: "
                f"'{nc.text[:30]}...'."
            )
            logger.warning(warning_msg)
            data_quality_warnings.append(warning_msg)
            continue

        if is_fallback:
            owner_fallbacks += 1

        new_by_owner.setdefault(owner_key, []).append((nc, is_fallback))

    # ─── STEP 3 & 4: Pairwise Scoring & Best-Match Selection ─────────────────────

    for owner_key, nc_tuples in new_by_owner.items():
        # Retrieve historical candidates pool for this owner key
        if owner_key in historical_by_owner_id:
            hist_list = historical_by_owner_id[owner_key]
        elif owner_key in historical_by_owner_name:
            hist_list = historical_by_owner_name[owner_key]
        else:
            hist_list = []

        if not hist_list:
            # No historical commitments for this owner: all new commitments are new
            for nc, _ in nc_tuples:
                result_new.append(nc)
            continue

        hist_by_id = {hc.id: hc for hc in hist_list}

        for nc, _ in nc_tuples:
            candidates: List[MatchCandidate] = []

            for hc in hist_list:
                # Fallback normalization check
                norm_new = nc.normalized_text
                if not norm_new or not norm_new.strip():
                    norm_new = normalize_text(nc.text)
                    warning_msg = (
                        f"New commitment {nc.id or nc.dedup_key} has empty "
                        f"normalized_text. Fallback applied."
                    )
                    data_quality_warnings.append(warning_msg)

                norm_hist = hc.normalized_text
                if not norm_hist or not norm_hist.strip():
                    norm_hist = normalize_text(hc.text)
                    warning_msg = (
                        f"Historical commitment {hc.id} has empty "
                        f"normalized_text. Fallback applied."
                    )
                    data_quality_warnings.append(warning_msg)

                # Core Similarity Scoring
                sim_res = similarity_score(norm_new, norm_hist)
                prefix_res = has_prefix_match(norm_new, norm_hist)

                # Prefix Boost Policy
                boosted_score = sim_res.score
                if prefix_res.matched:
                    boosted_score = min(1.0, sim_res.score + SCORE_BOOST_FOR_PREFIX_MATCH)

                above_threshold = boosted_score >= MATCH_THRESHOLD

                candidate = MatchCandidate(
                    new_commitment_id=nc.id or nc.dedup_key,
                    historical_commitment_id=hc.id,
                    raw_similarity_score=sim_res.score,
                    prefix_match=prefix_res,
                    boosted_score=boosted_score,
                    above_threshold=above_threshold,
                    similarity_breakdown=sim_res.breakdown,
                )
                candidates.append(candidate)
                total_comparisons += 1

            # Select best match above threshold
            above_threshold_candidates = [c for c in candidates if c.above_threshold]
            if not above_threshold_candidates:
                result_new.append(nc)
            else:
                # Sort by boosted_score descending
                above_threshold_candidates.sort(key=lambda x: x.boosted_score, reverse=True)
                best_candidate = above_threshold_candidates[0]

                hist_match = hist_by_id[best_candidate.historical_commitment_id]

                # Check if prefix boost was the deciding factor
                prefix_boost_applied = (
                    best_candidate.prefix_match.matched
                    and best_candidate.raw_similarity_score < MATCH_THRESHOLD
                    and best_candidate.boosted_score >= MATCH_THRESHOLD
                )

                matched_item = MatchedCommitment(
                    new_commitment=nc,
                    historical_commitment=hist_match,
                    similarity_score=best_candidate.boosted_score,
                    similarity_breakdown=best_candidate.similarity_breakdown,
                    prefix_boost_applied=prefix_boost_applied,
                )
                result_matched.append(matched_item)
                result_unchanged_ids.discard(hist_match.id)

    # ─── STEP 5: Conflict Detection & Handling ─────────────────────────────────

    conflicts_detected = 0
    hist_match_counts: Dict[str, int] = {}
    for mc in result_matched:
        hid = mc.historical_commitment.id
        hist_match_counts[hid] = hist_match_counts.get(hid, 0) + 1

    for hid, count in hist_match_counts.items():
        if count > 1:
            conflicts_detected += 1
            logger.info(
                "commitment_resolution_conflict",
                event="commitment_resolution_conflict",
                historical_id=hid,
                matched_by_count=count,
                meeting_id=payload.meeting_id,
                team_id=payload.team_id,
            )

    # ─── STEP 6: Unchanged Commitments Assembly ───────────────────────────────

    result_unchanged = [
        hc for hc in historical_pool if hc.id in result_unchanged_ids
    ]

    # ─── STEP 7: Invariant Check & Result Return ───────────────────────────────

    # Verify every new commitment is accounted for
    expected_new_count = len(payload.new_commitments)
    actual_processed_count = len(result_new) + len(result_matched)

    if expected_new_count != actual_processed_count:
        err_msg = (
            f"Invariant violation: new commitments count mismatch. "
            f"Expected: {expected_new_count}, Processed: {actual_processed_count} "
            f"(New: {len(result_new)}, Matched: {len(result_matched)})."
        )
        logger.error(err_msg)
        raise ResolverInvariantError(err_msg)

    # Statistics Calculation
    processing_time_ms = (time.monotonic() - start_time) * 1000
    prefix_boosts_applied = sum(1 for mc in result_matched if mc.prefix_boost_applied)

    stats = ResolutionStats(
        new_commitments_count=len(result_new),
        matched_commitments_count=len(result_matched),
        unchanged_commitments_count=len(result_unchanged),
        total_owners_processed=len(historical_by_owner_id),
        total_comparisons_made=total_comparisons,
        prefix_boosts_applied=prefix_boosts_applied,
        conflicts_detected=conflicts_detected,
        owner_fallback_count=owner_fallbacks,
        pool_truncations=pool_truncations,
        processing_time_ms=processing_time_ms,
        data_quality_warnings=data_quality_warnings,
    )

    return ResolutionResult(
        meeting_id=payload.meeting_id,
        team_id=payload.team_id,
        new_commitments=result_new,
        matched_commitments=result_matched,
        unchanged_commitments=result_unchanged,
        stats=stats,
    )
