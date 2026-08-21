# WhatsApp Renewal Message Format Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generate both renewal WhatsApp messages with valid emoji characters, WhatsApp single-asterisk bold, and a blank line between paragraphs.

**Architecture:** Keep the existing centralized message utility and `wa.me` URL builder. Change only the two message constants, using Unicode code-point escapes for emojis, and strengthen behavioral tests around the exact decoded payload.

**Tech Stack:** TypeScript, Vitest, Next.js, `encodeURIComponent`, Vercel.

---

### Task 1: Define the corrected payload

**Files:**
- Modify: `lib/utils/membershipRenewalWhatsApp.test.ts`
- Modify: `lib/utils/membershipRenewalWhatsApp.ts`

**Step 1: Write the failing test**

Update the exact-message assertions to require:

```ts
'Hola 👋 ... *1 clase disponible* ...\n\nPara que ... 🏹'
'Hola 👋 ... *vencida* ...\n\nPara continuar ... 🏹'
```

Add assertions that neither message contains `**`, both contain `\n\n`, and their first/last emoji code points are `1f44b` and `1f3f9`.

**Step 2: Run test to verify it fails**

Run: `npm test -- lib/utils/membershipRenewalWhatsApp.test.ts`

Expected: FAIL because the current messages contain double asterisks and only one newline.

**Step 3: Write minimal implementation**

Use `\u{1F44B}` and `\u{1F3F9}` in both message constants, single asterisks around emphasized text, and `\n\n` between paragraphs.

**Step 4: Run focused tests**

Run: `npm test -- lib/utils/membershipRenewalWhatsApp.test.ts tests/app/adminMembershipRenewalWhatsApp.test.ts`

Expected: PASS, including exact decoded `wa.me` payload.

**Step 5: Commit**

```bash
git add lib/utils/membershipRenewalWhatsApp.ts lib/utils/membershipRenewalWhatsApp.test.ts
git commit -m "fix(admin): format renewal WhatsApp messages"
```

### Task 2: Verify and release

**Files:**
- No production files beyond Task 1.

**Step 1: Run complete verification**

Run:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: all tests, lint, build, and whitespace verification pass.

**Step 2: Merge and deploy**

Merge `codex/whatsapp-message-formatting` into `main`, push `main`, and wait for the Vercel deployment containing the merge commit to become `READY`.

**Step 3: Production smoke test**

Confirm the production URL and admin student routes respond successfully, and verify Vercel metadata points to the exact `main` commit.
