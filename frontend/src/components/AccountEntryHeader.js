import React from "react";
import { LuDice5 } from "react-icons/lu";

export default function AccountEntryHeader({ title, children }) {
  return (
    <header className="login-header">
      <div className="account-entry-brand"><LuDice5 aria-hidden="true" /> Ludisist</div>
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </header>
  );
}
