# SENTINAI GUARDIAN — নিরাপদ Sepolia Self-Transfer মানবিক টেস্ট চেকলিস্ট (R8.4)

> **সতর্কতা:** এই চেকলিস্টটি শুধুমাত্র **Sepolia Testnet (`Chain ID: 11155111`)**-এ আপনার নিজস্ব টেস্ট ওয়ালেটে (`0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148`) **Self-Transfer (নিজের ওয়ালেট থেকে নিজের ওয়ালেটে)** করার জন্য। এতে আপনার টেস্ট ETH অন্য কারো কাছে যাবে না, শুধুমাত্র সামান্য Sepolia গ্যাস ফি খরচ হবে।

---

## ১. প্রাক-যাচাই (Pre-Flight Verification)

ট্রানজেকশন করার আগে নিচের তথ্যগুলো মিলিয়ে নিন:
- **নেটওয়ার্ক:** Ethereum Sepolia Testnet (`Chain ID: 11155111`)
- **আপনার কনফিগার করা টেস্ট ওয়ালেট:** `0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148`
- **বর্তমান ব্যালেন্স:** `0.05 ETH` (Sepolia)
- **প্রাপক (`alice`):** আপনার নিজের ওয়ালেট `0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148` (যাতে ফান্ড নিজের ওয়ালেটেই থাকে)
- **ট্রানজেকশন পরিমাণ:** `0.0001 ETH`

---

## ২. ধাপে ধাপে বাটন ক্লিক নির্দেশিকা (Step-by-Step Checklist)

### ধাপ ১: সার্ভার চালু ও লগইন
1. টার্মিনালে `npm run dev` চালিয়ে ব্রাউজারে `http://localhost:3000` ওপেন করুন।
2. পাসওয়ার্ড বক্সে আপনার `.env`-এ সেট করা `OPERATOR_PASSWORD` দিয়ে **"Authenticate Session"** বাটনে ক্লিক করুন।
3. স্ক্রিনের বাম পাশে **Sepolia Network: Connected (11155111)** এবং আপনার ওয়ালেট ব্যালেন্স `0.05 ETH` দেখাচ্ছে কিনা নিশ্চিত করুন।

### ধাপ ২: নিরাপদ পলিসি সেটআপ (`Alice`-কে নিজের ওয়ালেটে যুক্ত করা)
1. বাম পাশের মেনু থেকে **"Policies"**-এ ক্লিক করুন (অথবা পেজের নিচে **Policy Management & Trusted Contacts** সেকশনে যান)।
2. **"Bind 'alice' to My Test Wallet (Safe Self-Transfer)"** বাটনে ক্লিক করুন।
3. সঙ্গে সঙ্গে নিচের টেবিলে `alice` -> `0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148` যুক্ত হয়ে যাবে এবং SQLite ডাটাবেসে সেভ হবে।

### ধাপ ৩: ট্রানজেকশন প্রোপোজাল তৈরি ও যাচাই (Phase 1 — Prepare)
1. উপরে **Agent Command Center**-এর ইনপুট বক্সে লিখুন:
   ```text
   Send 0.0001 ETH to alice
   ```
2. ডান পাশের নীল **Send** আইকনে ক্লিক করুন।
3. **Cryptographic Verification & Evidence Panel**-এ নিচের ৫টি জিনিস অবশ্যই মিলিয়ে দেখুন:
   - **AI Provenance Badge:** `LIVE AI (groq · llama-3.3-70b-versatile)` (অথবা `LOCAL DETERMINISTIC FALLBACK`)
   - **Action & Amount:** `TRANSFER` — `0.0001 ETH`
   - **Recipient Address (`To`):** `0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148` *(আপনার নিজের ওয়ালেট ঠিকানা কিনা তা মিলিয়ে দেখুন)*
   - **Policy Status:** `ALLOW` (সবুজ ব্যাজ)
   - **Simulation Status:** `SUCCESS` (Estimated Gas: `12000` — Sepolia EIP-2780 Self-Transfer)

### ধাপ ৪: বাতিল বাটন পরীক্ষা (ঐচ্ছিক নিরাপত্তা পরীক্ষা)
1. ট্রানজেকশন পাঠানোর আগে **"Cancel"** বাটনে ক্লিক করে দেখুন।
2. নিচে **Security Center & Execution Audit Trail** টেবিলে গিয়ে দেখুন প্রোপোজালটির স্ট্যাটাস `CANCELLED` হয়ে গেছে।

### ধাপ ৫: ১টি নিয়ন্ত্রিত Sepolia Self-Transfer এক্সিকিউট করা (Phase 2 — Authorize & Execute)
1. আবার ইনপুট বক্সে লিখুন:
   ```text
   Send 0.0001 ETH to alice
   ```
2. প্রোপোজাল তৈরি হলে এবং প্রাপক ঠিকানা `0xaeb8387cB3FDa31D059Ac13a42fb201fCb3A2148` নিশ্চিত হওয়ার পর সবুজ **"Authorize & Sign Transaction"** বাটনে **একবার** ক্লিক করুন।
3. বাটনটি `SUBMITTING` -> `SUBMITTED` হয়ে Sepolia ব্লকচেইনে কনফার্ম হওয়ার পর **`CONFIRMED`** দেখাবে এবং একটি **Transaction Hash (`0x...`)** প্রদর্শন করবে।
4. **Security Center & Execution Audit Trail** টেবিলে থাকা `0x...` ট্রানজেকশন হ্যাশ লিঙ্কে ক্লিক করে `sepolia.etherscan.io`-তে ট্রানজেকশনটি যাচাই করুন।

---

## ৩. জরুরি রিকভারি (যদি নেটওয়ার্ক টাইমআউট হয়)
- যদি ট্রানজেকশন ব্রডকাস্ট হওয়ার পর ইন্টারনেট ধীরগতির কারণে স্ট্যাটাস `RECONCILIATION_REQUIRED` বা `EXECUTION_UNKNOWN` দেখায়, তাহলে **আবার নতুন ট্রানজেকশন পাঠাবেন না**।
- **Security Center & Execution Audit Trail** টেবিলে ওই প্রোপোজালের নিচে থাকা **"Reconcile Receipt"** বাটনে ক্লিক করুন—সিস্টেম নতুন কোনো ট্রানজেকশন ব্রডকাস্ট না করেই আগের ট্রানজেকশন হ্যাশ ও রিসিপ্ট রিকভার করে `CONFIRMED` স্ট্যাটাসে আপডেট করে দেবে।
