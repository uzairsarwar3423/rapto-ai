import React from "react";
import type { TextProps } from '@react-pdf/renderer';
import {
  Document,
  Page,
  Path,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import { splitKeyPhrases } from "../lib/summary";
import { PDF_FONT_FAMILY } from "./pdfFonts";
import type { MeetingReport } from "./meetingReport";

/**
 * Meeting report — A4, Inter, white page, one restrained green accent.
 *
 * Layout rules:
 *   • Headings use minPresenceAhead so a heading is never stranded at the bottom of a page.
 *   • Every bullet is unbreakable (wrap={false}); sections and topics may flow across pages.
 *   • A fixed footer carries the brand and "Page X of Y"; pages after the first get a slim running header.
 */

type TextStyle = TextProps["style"];

// ─── Tokens ──────────────────────────────────────────────────────────────────

const C = {
  ink: "#16201C", // deep charcoal
  body: "#38433E",
  muted: "#6B7571",
  faint: "#9AA39F",
  rule: "#E3E8E5",
  brand: "#1A6B3C",
} as const;

const PAGE_PAD_X = 56;

const s = StyleSheet.create({
  page: {
    fontFamily: PDF_FONT_FAMILY,
    fontSize: 10,
    // NB: no page-level lineHeight — a unitless lineHeight on <Page> breaks dynamic render() text
    // (page numbers) in @react-pdf/renderer, so every text style sets its own.
    color: C.body,
    backgroundColor: "#FFFFFF",
    paddingTop: 58,
    paddingBottom: 76,
    paddingHorizontal: PAGE_PAD_X,
  },

  // Masthead
  masthead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  wordmarkRow: { flexDirection: "row", alignItems: "flex-start" },
  wordmark: { fontSize: 16, fontWeight: 700, color: C.ink, letterSpacing: -0.4, lineHeight: 1 },
  wordmarkDot: { width: 4.5, height: 4.5, borderRadius: 3, backgroundColor: C.brand, marginLeft: 1.5, marginTop: 1 },
  eyebrow: { fontSize: 7.5, fontWeight: 600, color: C.faint, letterSpacing: 1.4, textTransform: "uppercase" },
  mastRule: { height: 0.75, backgroundColor: C.rule, marginTop: 16, marginBottom: 26 },

  title: { fontSize: 25, fontWeight: 700, color: C.ink, lineHeight: 1.18, letterSpacing: -0.6 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 14 },
  metaItem: { flexDirection: "row", alignItems: "center", marginRight: 14, marginBottom: 3 },
  statusDot: { width: 5, height: 5, borderRadius: 3, marginRight: 5 },
  metaText: { fontSize: 9.5, color: C.muted, lineHeight: 1.3 },
  metaStatus: { fontSize: 9.5, fontWeight: 600, color: C.ink, lineHeight: 1.3 },
  metaSep: { width: 0.75, height: 9, backgroundColor: C.rule, marginRight: 14 },
  titleRule: { height: 0.75, backgroundColor: C.rule, marginTop: 20, marginBottom: 4 },

  // Sections
  section: { marginTop: 26 },
  headingRow: { flexDirection: "row", alignItems: "baseline", marginBottom: 12 },
  headingIndex: { width: 22, fontSize: 8, fontWeight: 600, color: C.brand, letterSpacing: 0.6 },
  heading: { fontSize: 14, fontWeight: 600, color: C.ink, letterSpacing: -0.2, lineHeight: 1.2 },

  purpose: { fontSize: 12.5, lineHeight: 1.55, fontWeight: 500, color: C.ink, letterSpacing: -0.1 },
  overview: { fontSize: 10.5, lineHeight: 1.7, color: C.body, maxWidth: 450 },

  // Lists
  bulletRow: { flexDirection: "row", marginBottom: 8 },
  bulletMark: { width: 3.4, height: 3.4, borderRadius: 2, backgroundColor: C.brand, marginTop: 5.6, marginRight: 10 },
  bulletText: { flex: 1, fontSize: 10.5, lineHeight: 1.6, color: C.body },

  // Topics
  topic: { marginBottom: 16 },
  topicHead: { flexDirection: "row", alignItems: "flex-start", marginBottom: 7 },
  topicIndex: { width: 22, fontSize: 8, fontWeight: 600, color: C.faint, letterSpacing: 0.6, marginTop: 2.7 },
  topicTitle: { flex: 1, fontSize: 11.5, fontWeight: 600, color: C.ink, lineHeight: 1.35 },
  dashRow: { flexDirection: "row", marginBottom: 5, paddingLeft: 22 },
  dashMark: { width: 6, height: 0.9, backgroundColor: C.faint, marginTop: 7.4, marginRight: 9 },
  dashText: { flex: 1, fontSize: 10, lineHeight: 1.6, color: C.body },

  // Conclusions
  outcomes: { borderLeftWidth: 1.5, borderLeftColor: C.brand, paddingLeft: 14 },
  outcomeRow: { flexDirection: "row", marginBottom: 9 },
  outcomeIcon: { width: 9, height: 9, marginTop: 3.2, marginRight: 9 },
  outcomeText: { flex: 1, fontSize: 10.5, fontWeight: 500, lineHeight: 1.6, color: C.ink },
  subHeading: {
    fontSize: 8,
    fontWeight: 600,
    color: C.muted,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 14,
    marginBottom: 9,
  },

  // Fixed chrome
  runningHeaderWrap: { position: "absolute", top: 26, left: PAGE_PAD_X, right: PAGE_PAD_X },
  runningHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 6,
    borderBottomWidth: 0.75,
    borderBottomColor: C.rule,
  },
  runningTitle: { flex: 1, fontSize: 7.5, color: C.faint, marginRight: 24 },
  runningBrand: { fontSize: 7.5, fontWeight: 600, color: C.faint, letterSpacing: 0.4 },
  footer: {
    position: "absolute",
    bottom: 28,
    left: PAGE_PAD_X,
    right: PAGE_PAD_X,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    borderTopWidth: 0.75,
    borderTopColor: C.rule,
  },
  footerLeft: { flexDirection: "row", alignItems: "center" },
  footerDot: { width: 3.5, height: 3.5, borderRadius: 2, backgroundColor: C.brand, marginRight: 6 },
  footerText: { fontSize: 7.5, color: C.faint, letterSpacing: 0.3 },
});

// ─── Building blocks ─────────────────────────────────────────────────────────

/** Text with deadlines / dates / priorities set in a heavier weight — a quiet typographic emphasis. */
function EmphasizedText({ text, style }: { text: string; style: TextStyle }) {
  const segments = splitKeyPhrases(text);
  return (
    <Text style={style}>
      {segments.map((segment, i) =>
        segment.strong ? (
          <Text key={i} style={{ fontWeight: 600, color: C.ink }}>
            {segment.text}
          </Text>
        ) : (
          segment.text
        )
      )}
    </Text>
  );
}

function SectionHeading({ index, children }: { index: string; children: React.ReactNode }) {
  // minPresenceAhead: if less than this much content fits below, the heading moves to the next page too.
  return (
    <View style={s.headingRow} wrap={false} minPresenceAhead={64}>
      <Text style={s.headingIndex}>{index}</Text>
      <Text style={s.heading}>{children}</Text>
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={s.bulletRow} wrap={false}>
      <View style={s.bulletMark} />
      <EmphasizedText text={text} style={s.bulletText} />
    </View>
  );
}

function Check() {
  return (
    <Svg style={s.outcomeIcon} viewBox="0 0 12 12">
      <Path
        d="M2 6.4 L4.9 9.2 L10 3"
        stroke={C.brand}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function Outcome({ text }: { text: string }) {
  return (
    <View style={s.outcomeRow} wrap={false}>
      <Check />
      <EmphasizedText text={text} style={s.outcomeText} />
    </View>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

// ─── Document ────────────────────────────────────────────────────────────────

export function MeetingReportDocument({ report }: { report: MeetingReport }) {
  let sectionNo = 0;
  const nextIndex = () => pad(++sectionNo);

  const metaItems = [report.dateText, report.timeText, report.durationText].filter(Boolean);

  return (
    <Document
      title={`${report.title} — Meeting report`}
      author="Rapto"
      creator="Rapto"
      producer="Rapto"
      subject="AI-generated meeting report"
      language={report.language}
    >
      <Page size="A4" style={s.page} wrap>
        {/* Running header (pages 2+) */}
        <View
          fixed
          style={s.runningHeaderWrap}
          render={({ pageNumber }) =>
            pageNumber > 1 ? (
              <View style={s.runningHeader}>
                <Text style={s.runningTitle}>
                  {report.title.length > 90 ? `${report.title.slice(0, 89)}…` : report.title}
                </Text>
                <Text style={s.runningBrand}>Rapto</Text>
              </View>
            ) : null
          }
        />

        {/* Footer (every page). Fixed elements must be declared BEFORE the flowing content. */}
        <View style={s.footer} fixed>
          <View style={s.footerLeft}>
            <View style={s.footerDot} />
            <Text style={s.footerText}>Rapto · AI meeting report · {report.generatedText}</Text>
          </View>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>

        {/* Masthead */}
        <View style={s.masthead}>
          <View style={s.wordmarkRow}>
            <Text style={s.wordmark}>Rapto</Text>
            <View style={s.wordmarkDot} />
          </View>
          <Text style={s.eyebrow}>Meeting report</Text>
        </View>
        <View style={s.mastRule} />

        <Text style={s.title}>{report.title}</Text>

        <View style={s.metaRow}>
          <View style={s.metaItem}>
            <View style={[s.statusDot, { backgroundColor: report.isComplete ? C.brand : C.faint }]} />
            <Text style={s.metaStatus}>{report.statusLabel}</Text>
          </View>
          {metaItems.length > 0 && <View style={s.metaSep} />}
          {metaItems.map((item, i) => (
            <View key={i} style={s.metaItem}>
              <Text style={s.metaText}>{item}</Text>
            </View>
          ))}
        </View>
        <View style={s.titleRule} />

        {/* 01 — Meeting purpose */}
        {report.purpose ? (
          <View style={s.section}>
            <SectionHeading index={nextIndex()}>Meeting purpose</SectionHeading>
            <Text style={s.purpose}>{report.purpose}</Text>
          </View>
        ) : null}

        {/* 02 — Overview */}
        {report.overview ? (
          <View style={s.section}>
            <SectionHeading index={nextIndex()}>Overview</SectionHeading>
            {report.overview.split(/\n{2,}/).map((paragraph, i) => (
              <Text key={i} style={[s.overview, i > 0 ? { marginTop: 8 } : {}]}>
                {paragraph.replace(/\n/g, " ")}
              </Text>
            ))}
          </View>
        ) : null}

        {/* 03 — Key takeaways */}
        {report.keyTakeaways.length > 0 && (
          <View style={s.section}>
            <SectionHeading index={nextIndex()}>Key takeaways</SectionHeading>
            {report.keyTakeaways.map((item, i) => (
              <Bullet key={i} text={item} />
            ))}
          </View>
        )}

        {/* 04 — Topics discussed */}
        {report.topics.length > 0 && (
          <View style={s.section}>
            <SectionHeading index={nextIndex()}>Topics discussed</SectionHeading>
            {report.topics.map((topic, i) => (
              <View key={i} style={s.topic}>
                {/* Keep each topic title with at least its first point */}
                <View style={s.topicHead} wrap={false} minPresenceAhead={44}>
                  <Text style={s.topicIndex}>{pad(i + 1)}</Text>
                  <Text style={s.topicTitle}>{topic.title}</Text>
                </View>
                {topic.points.map((point, j) => (
                  <View key={j} style={s.dashRow} wrap={false}>
                    <View style={s.dashMark} />
                    <EmphasizedText text={point} style={s.dashText} />
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* 05 — Conclusions (+ decisions) */}
        {(report.conclusions.length > 0 || report.decisions.length > 0) && (
          <View style={s.section}>
            <SectionHeading index={nextIndex()}>Conclusions</SectionHeading>
            {report.conclusions.length > 0 && (
              <View style={s.outcomes}>
                {report.conclusions.map((item, i) => (
                  <Outcome key={i} text={item} />
                ))}
              </View>
            )}
            {report.decisions.length > 0 && (
              <View>
                <Text style={s.subHeading} wrap={false} minPresenceAhead={50}>
                  Decisions
                </Text>
                <View style={s.outcomes}>
                  {report.decisions.map((item, i) => (
                    <Outcome key={i} text={item} />
                  ))}
                </View>
              </View>
            )}
          </View>
        )}
      </Page>
    </Document>
  );
}
