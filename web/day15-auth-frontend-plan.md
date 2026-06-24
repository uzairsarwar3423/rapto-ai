# Day 15 — Auth Frontend Full Plan
## Login/Register UI · AuthProvider · Axios Interceptors · Protected Routes

> **Theme:** Pehli baar real user interaction. Login, register, email verify — sab kuch real backend se connected.

---

## Table of Contents

1. [Big Picture — Aaj Kya Ban Raha Hai](#1-big-picture)
2. [Competitor UX Research — Fathom, Fireflies, Grain](#2-competitor-ux-research)
3. [Our UI/UX Strategy — Vocaply Auth Design](#3-our-uiux-strategy)
4. [File Map — Konsi File Mein Kya Hoga](#4-file-map)
5. [File-by-File Deep Dive](#5-file-by-file-deep-dive)
   - [client.ts — Axios + Interceptors](#51-clientts--axios--interceptors)
   - [auth.store.ts — Zustand](#52-authstorets--zustand)
   - [Auth Hooks](#53-auth-hooks)
   - [AuthProvider.tsx](#54-authprovidertsx)
   - [BFF Refresh Route](#55-bff-refresh-route)
   - [LoginForm.tsx](#56-loginformtsx)
   - [RegisterForm.tsx + PasswordStrengthBar](#57-registerformtsx--passwordstrengthbar)
   - [Verify Email Page](#58-verify-email-page)
   - [Forgot/Reset Password Pages](#59-forgotreset-password-pages)
   - [AuthGuard + Protected Routes](#510-authguard--protected-routes)
6. [Security Decisions](#6-security-decisions)
7. [Scalability & Performance Decisions](#7-scalability--performance-decisions)
8. [Build Order](#8-build-order)
9. [End-of-Day Checklist](#9-end-of-day-checklist)

---

## 1. Big Picture

Day 13-14 mein backend ready ho gaya — register, login, refresh, OAuth, password reset, sab APIs working.  
Day 15 mein **frontend wo sab connect karega**:

```
User browser
    │
    ▼
[ Login/Register Pages ]  ← React Hook Form + Zod
    │
    ▼
[ Axios Client ]  ← Bearer token attach, 401 → silent refresh
    │
    ▼
[ Next.js BFF Route ]  ← /api/auth/refresh (cookie proxy)
    │
    ▼
[ Backend API ]  ← Day 13/14 ka kaam
    │
    ▼
[ Zustand Store ]  ← accessToken (memory), user object
    │
    ▼
[ AuthGuard ]  ← Protected routes (/dashboard)
```

**Core principle:** Access token kabhi `localStorage` mein nahi — sirf memory (Zustand). Refresh token sirf HttpOnly cookie mein. Yeh Day 13 ka security model frontend tak carry hota hai.

---

## 2. Competitor UX Research — Fathom, Fireflies, Grain

Yeh teen tools meeting-intelligence space mein hain (jaisa Vocaply). Unki auth UI patterns dekhte hain — kya copy karna hai, kya better karna hai.

### Fathom
- **Strength:** Extremely minimal login — sirf "Continue with Google" button, email/password second priority
- **Pattern:** SSO-first design — kyunki target audience (sales/work teams) Google Workspace use karte hain
- **Weakness:** Email/password users ke liye thoda buried — extra click chahiye

### Fireflies.ai
- **Strength:** Clear value prop on auth screen — side panel mein "what you get" bullets (transcripts, summaries, etc.)
- **Pattern:** Split-screen layout — left form, right marketing/feature highlights
- **Weakness:** Form thoda crowded feels — bahut sare social login options ek saath

### Grain
- **Strength:** Sabse clean, fastest-feeling auth — single column, generous whitespace, fast transitions
- **Pattern:** Password strength feedback real-time hai, friendly micro-copy ("Looking good!")
- **Weakness:** Error states kabhi generic lagte hain ("Something went wrong")

---

## 3. Our UI/UX Strategy — Vocaply Auth Design

**Decision: Grain ki simplicity + Fireflies ki clarity + Fathom ka OAuth-first instinct — lekin email/password ko equal footing do.**

| Principle | Implementation |
|---|---|
| **Speed perception** | Single column, max-width 400px card — Grain jaisa. No split-screen marketing clutter on Day 1. |
| **Trust signals** | Clear error messages (specific, not generic "Something went wrong") |
| **OAuth visibility** | Google button ABOVE email form with "or" divider — discoverable but not forced |
| **Real-time feedback** | PasswordStrengthBar — Grain-style instant feedback, friendly labels (Weak/Fair/Good/Strong) |
| **No dead-ends** | Har error state ka actionable next step hai (resend link, request new token) |
| **Zero flash-of-content** | FullPageSpinner during auth check — koi "logged out" flash dikhe na pehle |
| **Accessible by default** | Labels, aria-describedby, focus management — built-in se hi |

**Why NOT split-screen (Fireflies style) on Day 1?**  
Marketing copy/illustrations Day 1 distraction hain — auth flow ka core focus "fast signup/login" hona chahiye. Split-screen marketing baad mein A/B test ke through add karenge (Day 26+ jab AppShell/branding finalize ho).

**Speed/Fast feel ke patterns:**
- Optimistic UI: Login button click → immediately spinner, error aaye toh revert
- No full-page reload anywhere — sab client-side navigation (Next.js router)
- Silent token refresh — user ko kabhi "session expired, login again" jaisa friction nahi (jab tak refresh token valid hai)
- Errors on blur, not on every keystroke — typing interrupt nahi hoti

---

## 4. File Map

```
apps/web/src/
│
├── lib/api/
│   ├── client.ts                 ← Axios instance + interceptors (token attach, 401 refresh)
│   └── auth.api.ts                ← Raw API functions (login, register, logout, etc.)
│
├── store/
│   ├── auth.store.ts              ← Zustand: accessToken, user, isAuthenticated, isLoading
│   ├── ui.store.ts                ← Zustand: UI state (modals, toasts, etc.)
│   └── index.ts                   ← Central export
│
├── shared/
│   ├── providers/
│   │   ├── Providers.tsx          ← Root wrapper (combines all providers)
│   │   ├── AuthProvider.tsx       ← Silent refresh on mount + periodic refresh
│   │   └── QueryProvider.tsx      ← TanStack Query client setup
│   └── components/feedback/
│       └── FullPageSpinner.tsx    ← Loading state during auth check
│
├── features/auth/
│   ├── components/
│   │   ├── AuthCard.tsx           ← Reusable centered card wrapper
│   │   ├── LoginForm.tsx
│   │   ├── RegisterForm.tsx
│   │   ├── PasswordStrengthBar.tsx
│   │   ├── OAuthButton.tsx        ← "Continue with Google"
│   │   └── AuthGuard.tsx          ← Protected route wrapper
│   ├── hooks/
│   │   ├── useAuth.ts             ← Read current user state
│   │   ├── useLogin.ts            ← Login mutation
│   │   ├── useRegister.ts         ← Register mutation
│   │   └── useLogout.ts           ← Logout mutation
│   ├── api/
│   │   └── auth.api.ts            ← Feature-scoped API calls
│   ├── types/
│   │   └── auth.types.ts          ← TypeScript types (User, LoginInput, etc.)
│   └── index.ts                   ← Barrel export
│
├── app/
│   ├── (auth)/
│   │   ├── layout.tsx             ← Auth shell — centered card layout
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   ├── verify-email/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   └── reset-password/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx             ← Wrapped with AuthGuard
│   │   └── dashboard/page.tsx     ← Temporary placeholder
│   ├── api/auth/refresh/route.ts  ← BFF proxy route
│   └── layout.tsx                 ← Root layout — Providers wrap
```

---

## 5. File-by-File Deep Dive

---

### 5.1 `client.ts` — Axios + Interceptors

**Kya hai:** Ek central Axios instance jo har API call use karega. Do interceptors — request aur response.

**Request Interceptor — Token Attach:**
```
Har outgoing request par:
  → Zustand store se accessToken nikalo
  → Hai? → Authorization: Bearer <token> header add karo
  → Nahi? → header skip karo (request waise hi jaaye, backend 401 dega agar protected route)
```

**Response Interceptor — Silent 401 Refresh (Sabse Important Part):**

Yeh "queue" pattern hai. Samjho kyun zaroori hai:

```
Scenario: User ka access token expire ho gaya. User dashboard par 5 API
calls simultaneously trigger karta hai (jobs list, candidates, stats, etc.)

BINA QUEUE KE:
  → 5 requests → sab 401 → sab independently /auth/refresh call karein
  → 5 refresh calls = backend par 5x refresh token rotation
  → Race condition: pehla refresh purana token delete karta hai,
    doosra refresh "token not found" error deta hai
  → User accidentally logged out ho jaata hai!

QUEUE KE SAATH:
  → Pehla 401 → isRefreshing = true, refresh call shuru
  → Baki 4 requests → "refresh already in progress" → queue mein wait karo
  → Refresh complete → naya token sab 4 queued requests ko milta hai
  → Sab 5 original requests retry hoke succeed
```

**Flow breakdown:**
```
Step 1: Response 401 hai aur yeh first retry hai (original._retry not set)?
  → Nahi: reject normally (genuine 401, e.g. wrong permissions)
  → Haan: continue

Step 2: isRefreshing already true hai?
  → Haan: Promise return karo jo refreshSubscribers queue mein wait kare
  → Jab refresh complete hoga, callback fire hoga naye token ke saath
  → Original request retry ho jaayegi naye token se

Step 3: isRefreshing false hai (yeh pehla 401 hai)?
  → original._retry = true (infinite loop prevent)
  → isRefreshing = true
  → POST /api/auth/refresh (BFF route — cookie proxy)
  → Success:
      → naya accessToken Zustand mein set karo
      → sare queued subscribers ko naya token do (unblock)
      → original request retry karo naye token se
  → Failure:
      → clearAuth() — store reset
      → window.location.href = '/login?reason=session_expired'
      → (Hard redirect — yeh edge case hai, fresh state chahiye)
  → finally: isRefreshing = false
```

**Kyun `/api/auth/refresh` (Next.js BFF) na ki seedha backend?**  
Refresh token HttpOnly cookie mein hai — sirf same-origin requests automatically cookie bhejte hain. Frontend (`vocaply.com`) aur backend (`api.vocaply.com`) alag domains hain — cross-domain cookie complexity avoid karne ke liye Next.js apna proxy route rakhta hai jo same-origin hai.

---

### 5.2 `auth.store.ts` — Zustand

**Kya hai:** Global client-side state — kaun logged in hai, accessToken kya hai, loading state.

**State shape:**
```
accessToken:     string | null   ← MEMORY ONLY, kabhi persist nahi
user:            User | null
isAuthenticated: boolean
isLoading:       boolean         ← true jab tak initial auth check complete na ho
```

**Actions:**
```
setUser(user)        → user set karo, isAuthenticated derive karo
setAccessToken(token) → token update karo (login, refresh ke baad)
clearAuth()          → sab reset (logout, refresh fail)
setLoading(bool)     → AuthProvider control karta hai
```

**Kyun Zustand (na Redux, na Context)?**
- Context API: re-render performance issues bade apps mein
- Redux: boilerplate zyada — chhote auth state ke liye overkill
- Zustand: minimal API, no providers wrapper needed for store access, devtools support

**Kyun `accessToken` localStorage mein NAHI?**  
XSS attack scenario: Agar koi malicious script inject ho jaaye page mein, `localStorage.getItem('token')` se token chura sakta hai — permanently usable until expiry.  
Memory mein: page refresh hote hi gone — XSS attacker ko sirf current-session-tab tak access milta, persistent nahi.

---

### 5.3 Auth Hooks

**`useAuth.ts`** — Simple selector hook
```
→ Zustand store se { user, isAuthenticated, isLoading } return karo
→ Components yeh use karke conditional rendering karein
```

**`useLogin.ts`** — Login mutation (TanStack Query)
```
mutationFn: authApi.login({ email, password })
onSuccess:
  → setAccessToken(accessToken)  ← Zustand update
  → setUser(user)
  → Redirect logic:
      user.teamId hai? → /dashboard
      nahi? → /onboarding (naya user, team setup nahi hua)
```

**`useRegister.ts`** — Register mutation
```
mutationFn: authApi.register({ name, email, password })
onSuccess:
  → Redirect: /verify-email-sent?email=<email>
  → (Yeh page bata: "Check your email")
  → NOTE: register se accessToken nahi milta — account unverified hai
```

**`useLogout.ts`** — Logout mutation
```
mutationFn: authApi.logout()
onSettled (success ya failure dono mein):
  → clearAuth() — Zustand reset
  → queryClient.clear() — SAB cached data clear (jobs, candidates, sab)
  → router.push('/login')

Kyun onSettled (na onSuccess)?
  → Agar logout API call fail bhi ho jaaye (network issue),
    client-side state phir bhi clear honi chahiye — user ko
    "logged out" feel hona chahiye, backend sync baad mein ho jaayega
```

**Kyun `queryClient.clear()` zaroori hai logout par?**  
TanStack Query cache mein previous user ka data (jobs, candidates) reh sakta hai. Naya user login kare, cache se purana data flash ho sakta hai — data leak between users (especially shared devices).

---

### 5.4 `AuthProvider.tsx`

**Kya hai:** App load hote hi check karo — user already logged in hai (valid refresh cookie)?

**Two `useEffect`s:**

**Effect 1 — Mount par silent refresh (Page load / refresh):**
```
Component mount hua
  → POST /api/auth/refresh (cookie automatically jaata hai)
  → Success:
      → accessToken + user Zustand mein set karo
      → User "logged in" state mein hai bina kuch type kiye
  → Failure (no cookie ya expired):
      → clearAuth() — guest state
  → Finally:
      → setLoading(false)  ← AuthGuard ab decide kar sakta hai
```

**Kyun yeh zaroori hai?**  
User browser band kare, kal wapas khole — access token (15min) expire ho gaya hoga lekin refresh token (30 days) cookie mein valid hai. Yeh effect silently naya access token le leta hai — user ko phir se login nahi karna padta.

**Effect 2 — Proactive Refresh (Every 13 minutes):**
```
setInterval har 13 minutes:
  → isAuthenticated false hai? → skip
  → POST /api/auth/refresh
  → Success: naya accessToken set karo
  → Failure: clearAuth()
```

**Kyun 13 minutes (access token 15 min ka hai)?**  
2-minute buffer — taaki token expire hone se PEHLE refresh ho jaaye. Agar user ne us waqt koi action kiya (jaisa save button click), token already fresh hai — no interrupt, no 401-retry-delay.

**Performance note:** Yeh background operation hai — user ko kabhi dikhta nahi, koi loading spinner nahi.

---

### 5.5 BFF Refresh Route — `app/api/auth/refresh/route.ts`

**Kya hai:** Next.js API route jo proxy ka kaam karta hai — browser cookie ↔ backend API ke beech.

**Flow:**
```
Step 1: Incoming request se cookie nikalo
  → req.cookies.get('vocaply_refresh')
  → Nahi mila? → 401 "No refresh token"

Step 2: Backend ko proxy karo
  → POST {API_URL}/auth/refresh
  → Cookie header manually forward karo
  → (Backend ka Express same logic chalata hai — Day 14 ka refresh service)

Step 3: Backend response handle karo
  → !ok? → 401 "Refresh failed"
  → ok: { accessToken } milta hai + Set-Cookie header (rotated token)

Step 4: Response banao
  → JSON body: { accessToken, user }
  → Set-Cookie header forward karo browser ko (rotation ka naya cookie)
```

**Kyun yeh extra layer (Next.js → Backend)?**
- Same-origin cookies: Browser → Next.js (same domain) → cookie automatically jaata hai
- Next.js → Backend: server-to-server, cookie manually forward
- Frontend code kabhi seedha `api.vocaply.com` ko cookie-based request nahi karta — sab Next.js route se hota hai

---

### 5.6 `LoginForm.tsx`

**Layout (AuthCard wrapper):**
```
┌─────────────────────────────────┐
│         vocaply (logo)           │  ← DM Sans 20px bold
│                                   │
│       Welcome back                │  ← Heading
│    Sign in to your account        │  ← Subtext, muted
│                                   │
│  [G] Continue with Google         │  ← OAuthButton, outline
│                                   │
│  ────────── or ──────────         │  ← Divider
│                                   │
│  Email                            │
│  [________________]               │
│                                   │
│  Password              [👁]       │
│  [________________]               │
│                                   │
│  [Account locked: 12 min left]   │  ← Amber banner (conditional)
│                                   │
│  [    Sign in (spinner)    ]      │  ← Full-width primary button
│                                   │
│  Forgot your password?            │  ← link
│                                   │
│  Don't have an account? Sign up   │  ← link
└─────────────────────────────────┘
```

**Validation (React Hook Form + Zod):**
```
loginSchema (frontend mirror of backend):
  email:    required, valid format
  password: required (strength check yahan nahi — woh register par)

Validation timing: onBlur (na onChange)
  → Kyun? Typing ke beech error flash hona annoying hai
  → Blur hone par check — user ne field complete kiya
```

**Error display logic:**
```
IF error.code === 'INVALID_CREDENTIALS':
  → Red text neeche password field ke: "Invalid email or password"

IF error.code === 'RATE_LIMITED' (account locked):
  → Amber banner ABOVE submit button
  → "Account locked. Try again in {X} minutes."
  → Submit button disabled

IF error.code === 'EMAIL_NOT_VERIFIED':
  → Banner: "Please verify your email first"
  → Link: "Resend verification email"
```

**Accessibility:**
```
→ Har input: <label htmlFor="email">
→ Error message: aria-describedby="email-error"
→ Submit button: aria-busy={isSubmitting}
→ Failed submit: focus() first error field — keyboard users ko pata chale kaha dekhna hai
```

---

### 5.7 `RegisterForm.tsx` + `PasswordStrengthBar.tsx`

**Layout:** LoginForm jaisa, plus:
```
Name field (sabse upar)
  → type="text", autoComplete="name"

Password field ke neeche:
  → PasswordStrengthBar component
```

**PasswordStrengthBar — Logic:**

```
4 horizontal bars, color-coded:

  Bar count | Color  | Label  | Condition
  ──────────┼────────┼────────┼─────────────────────────────
     1      | Red    | Weak   | < 8 characters
     2      | Orange | Fair   | length OK, missing uppercase OR number
     3      | Yellow | Good   | length + uppercase + number (no special char)
     4      | Green  | Strong | sab requirements met
```

**Visual:** Bars left-to-right fill hote hain jaise password type hota hai — Grain-style real-time feedback. "Fair" se "Good" tak transition smooth animate ho (CSS transition).

**Kyun yeh UX matters:**  
Backend already password rules enforce karta hai (Day 13 Zod schema) — lekin agar user submit kare aur 422 error mile, frustrating hai. PasswordStrengthBar real-time guidance deta hai — submit se pehle hi user sahi password bana leta hai. Friction kam, success rate zyada.

**Submit success — Inline state (not redirect):**
```
Form submit successful
  → Form fields hide ho jaate hain
  → Inline message dikhe (same card mein):
     "Check your email"
     "We sent a verification link to {email}"
     Icon: mail/envelope
  → Kyun inline, na redirect?
    User abhi yahan tha — context maintain rakho. Naya page load
    = extra wait, extra "kya hua?" confusion.
```

---

### 5.8 Verify Email Page

**URL:** `/verify-email?token=xxx`

**On mount:** `GET {API_URL}/auth/verify-email?token=xxx` call karo

**States:**

```
LOADING:
  → Spinner + "Verifying your email..."
  → Duration: typically < 1 second, lekin spinner dikhana zaroori
    (perceived performance — blank screen confusing lagta)

SUCCESS:
  → Green checkmark icon (animate in)
  → "Email verified!"
  → "You're now signed in." (backend ne auto-login kiya — accessToken mila)
  → Zustand mein setAccessToken + setUser karo (response se)
  → Button: "Go to Dashboard" → /dashboard

ERROR — TOKEN_INVALID:
  → "This verification link is invalid."
  → Button: "Request a new link"
  → + small email input + resend button (alag verification email trigger)

ERROR — TOKEN_EXPIRED:
  → "This link has expired."
  → Button: "Resend verification email"
  → + email input
```

**Design note:** Dono error states mein email input + resend — user ko register page wapas jaane ki zaroorat nahi, yahi se recover ho sakta hai.

---

### 5.9 Forgot/Reset Password Pages

**`/forgot-password`:**
```
LAYOUT:
  Heading: "Reset your password"
  Subtext: "Enter your email and we'll send a reset link"
  Email input
  Submit button: "Send reset link"

ON SUBMIT (chahe email exist kare ya nahi):
  → "If that email exists, we've sent a reset link"
  → Inline success state (jaisa register)
  → KOI error state jo email existence reveal kare — NAHI hai
```

**`/reset-password?token=xxx`:**
```
LAYOUT:
  Heading: "Set a new password"
  New password field + PasswordStrengthBar
  Confirm password field
  Submit button: "Reset password"

VALIDATION:
  → newPassword === confirmPassword (client-side check, instant feedback)
  → PasswordStrengthBar same rules as register

ON SUCCESS:
  → "Password updated! You're now signed in."
  → accessToken + user set (backend auto-login)
  → Button: "Go to Dashboard"

ON ERROR (TOKEN_INVALID / TOKEN_EXPIRED):
  → "This reset link is invalid or has expired."
  → Link: "Request a new reset link" → /forgot-password
```

---

### 5.10 AuthGuard + Protected Routes

**`AuthGuard.tsx` — Logic:**
```
Render hote hi:
  isLoading true hai? → FullPageSpinner dikhao, kuch decide na karo
  isLoading false:
    isAuthenticated false? → router.push('/login')
    user.teamId missing? → router.push('/onboarding')
    sab theek? → children render karo
```

**Kyun `isLoading` check pehle?**  
Page refresh hua. AuthProvider abhi `/api/auth/refresh` call kar raha hai (cookie check). Is beech `isAuthenticated` false hai (default state) — agar AuthGuard isi waqt redirect kar de `/login`, toh logged-in user ko bhi ek second ke liye login page flash hoga, phir dashboard. **Bad UX — "flash of wrong content".**

`isLoading: true` → spinner dikhao → refresh complete hote hi decide karo.

**Dashboard Layout:**
```
app/(dashboard)/layout.tsx
  → <AuthGuard> children </AuthGuard>
  → Future: AppShell (sidebar, navbar) Day 26 mein add hoga
  → Abhi: simple div wrapper
```

**Temporary Dashboard Page:**
```
→ useAuth() se user.name lo
→ "Welcome, {name} 👋"
→ "Dashboard coming soon — auth is working!"
→ Yeh placeholder hai — proof that auth pipeline end-to-end works
```

---

## 6. Security Decisions

### 6.1 Access Token — Memory Only (Zustand, not localStorage)
**Threat:** XSS attack → `localStorage.getItem('token')` → persistent theft.  
**Mitigation:** Memory-only → page refresh pe gone. Worst case XSS impact limited to current tab session.

### 6.2 Refresh Token — HttpOnly Cookie (Never JS-accessible)
JavaScript `document.cookie` se HttpOnly cookies read nahi ho sakte. XSS attacker access token chura sakta hai (memory mein hai, agar XSS execute ho raha hai memory bhi accessible hai) lekin refresh token bilkul untouchable.

### 6.3 BFF Proxy Pattern for Refresh
Cross-domain cookie issues avoid + same-origin security boundary maintain. Backend API direct expose nahi hota browser ko for cookie-based ops.

### 6.4 Concurrent 401 Queue (Race Condition Prevention)
Bina queue: multiple simultaneous refresh calls → backend rotation logic confuse → user accidentally logged out (Day 14 ka reuse-detection trigger ho sakta tha).  
Queue: ek refresh, sab requests benefit.

### 6.5 `queryClient.clear()` on Logout
Shared devices ka scenario: User A logout, User B login — agar cache clear na ho, User B ko User A ka cached data dikh sakta hai (privacy leak).

### 6.6 Generic Error Messages (No Enumeration on Frontend Too)
Forgot password page — frontend bhi backend ki tarah "If that email exists" message dikhata hai. Agar frontend alag UI dikhaye based on response (jo waise bhi same hai backend se) — consistent privacy.

### 6.7 Hard Redirect on Refresh Failure
`window.location.href = '/login?reason=session_expired'` — **not** `router.push`.  
Kyun? Hard redirect = full page reload = sab in-memory state (Zustand, React Query cache) clean slate se start. Soft navigation mein stale state reh sakta hai jo confusion create kare.

---

## 7. Scalability & Performance Decisions

### 7.1 Single Axios Instance (Singleton)
Sab API calls ek instance se — interceptors centrally maintain, naya endpoint add karo bina extra config ke.

### 7.2 TanStack Query for Server State
Login/register mutations TanStack Query use karte hain — automatic loading/error states, retry logic, cache invalidation built-in. Future mein jobs/candidates list bhi yehi pattern follow karega — consistency.

### 7.3 Code-Splitting via Route Groups
`(auth)` aur `(dashboard)` Next.js route groups — alag layouts, alag bundle chunks. Login page load karte waqt dashboard ka code download nahi hota.

### 7.4 Proactive Token Refresh (13-min interval)
User active hai aur token expire hone wala hai — refresh PEHLE ho jaata hai. User ko kabhi 401-retry delay feel nahi hota — perceived performance high.

### 7.5 Optimistic Loading States
Spinner immediately on submit click — network latency "felt" kam hoti hai jab UI immediately react kare, chahe actual response 500ms baad aaye.

### 7.6 Zustand — No Provider Re-render Cascade
Context API mein, agar `AuthContext` value change ho, sare consumers re-render. Zustand selectors granular hain — sirf woh component re-render hota hai jo specific slice use kar raha hai.

### 7.7 PasswordStrengthBar — Pure Client-Side Computation
Koi API call nahi har keystroke par — regex checks client-side instantly. Zero network latency for feedback.

### 7.8 Form Validation — Zod Schema Reuse
Backend (Day 13) aur frontend same Zod validation rules follow karte hain (conceptually mirrored). Future: shared package (`packages/validators`) se same schema import — DRY, consistency guaranteed.

---

## 8. Build Order

```
Step 1: auth.types.ts
  → User, LoginInput, RegisterInput types — sab files inhe import karein gi

Step 2: auth.store.ts (Zustand)
  → State shape + actions define karo
  → Dependencies: None

Step 3: client.ts (Axios) — Request interceptor first
  → Token attach logic — simple part pehle
  → Response interceptor (401 queue) — complex part baad mein
  → Dependencies: auth.store.ts

Step 4: auth.api.ts
  → login, register, logout, refresh functions — client.ts use karte hain
  → Dependencies: client.ts

Step 5: Auth hooks (useAuth, useLogin, useRegister, useLogout)
  → Dependencies: auth.api.ts, auth.store.ts

Step 6: BFF refresh route (/api/auth/refresh)
  → Dependencies: Backend API URL configured

Step 7: AuthProvider.tsx
  → Dependencies: auth.store.ts, BFF route

Step 8: Providers.tsx (root wrapper)
  → AuthProvider + QueryProvider combine karo
  → app/layout.tsx mein wrap karo

Step 9: AuthCard.tsx + FullPageSpinner.tsx
  → Reusable UI shells — baaki components inhe use karein gे

Step 10: LoginForm.tsx
  → Sabse pehle complete form — pattern establish hoga baaki forms ke liye

Step 11: PasswordStrengthBar.tsx + RegisterForm.tsx
  → LoginForm pattern reuse karo

Step 12: OAuthButton.tsx
  → Simple — Google icon + link to /api/auth/google

Step 13: Verify Email, Forgot Password, Reset Password pages
  → Pattern same — loading/success/error states

Step 14: AuthGuard.tsx
  → Dependencies: auth.store.ts, isLoading logic

Step 15: app/(auth)/layout.tsx + app/(dashboard)/layout.tsx
  → Centered card layout (auth) + AuthGuard wrapper (dashboard)

Step 16: Temporary dashboard page

Step 17: Full flow test
  → Register → check email → verify → auto-login → dashboard
```

---

## 9. End-of-Day Checklist

### API Client
- [ ] API calls Bearer token attach karte hain Zustand se
- [ ] 401 response → silent refresh trigger
- [ ] Concurrent 401s → ek hi refresh, sab queue mein wait
- [ ] Refresh fail → clearAuth() + hard redirect `/login?reason=session_expired`
- [ ] No token → no Authorization header, crash nahi hota

### AuthProvider
- [ ] Page load → `/api/auth/refresh` silently call hota hai
- [ ] Valid cookie → accessToken + user Zustand mein set
- [ ] No cookie → `isAuthenticated: false`, `isLoading: false`
- [ ] `isLoading` true se shuru, har case mein false ho jaata hai

### AuthGuard
- [ ] `/dashboard` without login → `/login` redirect
- [ ] `/dashboard` with valid session → placeholder dikhta hai
- [ ] FullPageSpinner during `isLoading` — no content flash

### Login Form
- [ ] Email + password labels ke saath render
- [ ] Empty submit → field errors
- [ ] Invalid email format → "Invalid email" error
- [ ] Wrong credentials → "Invalid email or password"
- [ ] Locked account → amber banner with time
- [ ] Successful login → `/dashboard` redirect
- [ ] Forgot password / Sign up links correct
- [ ] Google button Google logo ke saath visible

### Register Form
- [ ] Name + email + password render
- [ ] PasswordStrengthBar dikhta hai
- [ ] Weak password → 1 red bar + "Weak"
- [ ] Strong password → 4 green bars + "Strong"
- [ ] Duplicate email → error shown
- [ ] Successful register → "Check your email" inline state

### Verify Email
- [ ] Valid token → green checkmark success state
- [ ] Dashboard button works after verify
- [ ] Invalid token → "Request new link" error state
- [ ] Expired token → "Resend email" error state

### Forgot/Reset
- [ ] Forgot password — email existence reveal nahi hoti
- [ ] Reset password valid token → success + auto-login
- [ ] PasswordStrengthBar reset form par bhi

### Full Flow
- [ ] Register → email check → verify link → auto-login → `/dashboard`
- [ ] Complete flow < 2 minutes (real email)

---

*Day 15 complete hone ke baad: Auth pipeline end-to-end working — backend (Day 13-14) + frontend (Day 15). Day 16 se onboarding flow + team setup shuru.*
