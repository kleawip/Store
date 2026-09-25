"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, LockKeyhole, Phone } from "lucide-react";
import { useState, type FormEvent } from "react";

export default function SignInPage() {
  const [phone, setPhone] = useState("");
  const [attempted, setAttempted] = useState(false);
  const valid = /^[6-9]\d{9}$/.test(phone);
  function submit(event: FormEvent) { event.preventDefault(); setAttempted(true); }
  return <div className="auth-wrap"><div className="auth-card"><Link className="back-link" href="/cart"><ArrowLeft size={17}/> Back to bag</Link><div className="auth-icon"><LockKeyhole size={25}/></div><span className="section-overline">YOUR KLEAWIP ACCOUNT</span><h1>Sign in to continue</h1><p>When the store launches, your account will hold your orders, saved products, addresses and support requests in one place.</p><form onSubmit={submit}><label htmlFor="phone">Mobile number</label><div className="phone-input"><span>+91</span><input id="phone" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={10} placeholder="10-digit mobile number" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, ""))}/><Phone size={18}/></div>{attempted && !valid && <span className="form-error" role="alert">Enter a valid 10-digit Indian mobile number.</span>}{attempted && valid && <div className="form-message" role="status">The sign-in flow is ready for review. OTP delivery is not connected in this local preview; no code was sent.</div>}<button className="button button-primary auth-submit" type="submit">Continue securely <ArrowRight size={18}/></button></form><div className="auth-divider">PREVIEW ACCOUNT SCREENS</div><Link className="inline-link" href="/account">Explore account layout <ArrowRight size={17}/></Link><small>Viewing the account layout does not sign you in or expose customer data.</small></div></div>;
}
