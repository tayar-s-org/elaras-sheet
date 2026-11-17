import React from "react";
import { MASTER_RULES } from "../../rules.js";
import Book from "../../Book.jsx";

/* eslint-disable-next-line no-unused-vars */
export default function BookTab({ c, d, update, rule, setC, setConfirm, setToast, setRequestedPage, setTab, changeItem, addItem, requestedPage }) {
  return (
            <>
              <p className="intro">
                Consulte o livro e confira as mudanças da sua mesa.
              </p>
              <details className="rules-panel" open>
                <summary>Regras do mestre</summary>
                <p className="muted">
                  Transcrição resumida da planilha consultada em 16/11/2026.{" "}
                  <a
                    href="https://docs.google.com/spreadsheets/d/1_Ja3ozvLSkSPQ6GeCzjdUmY_0fY4_h5b6wL1PHwk8GY/edit?gid=0"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir a planilha original ↗
                  </a>
                </p>
                {MASTER_RULES.map(([title, text]) => (
                  <details key={title}>
                    <summary>{title}</summary>
                    <p>{text}</p>
                  </details>
                ))}
              </details>
              <Book requestedPage={requestedPage} />
            </>
  );
}
