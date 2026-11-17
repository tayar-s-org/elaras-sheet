import React from "react";
import { Field } from "../../ui/Field.jsx";

/* eslint-disable-next-line no-unused-vars */
export default function HistoryTab({ c, d, update, rule, setC, setConfirm, setToast, setRequestedPage, setTab, changeItem, addItem, requestedPage }) {
  return (
            <>
              <p className="intro">
                Os motivos para partir. As promessas para voltar.
              </p>
              <Field label="História do personagem">
                <textarea
                  maxLength={10000}
                  rows="10"
                  value={c.history}
                  onChange={(e) => update("history", e.target.value)}
                  placeholder="De onde você veio? O que procura? Por que está com o grupo?"
                />
              </Field>
              <Field label="Anotações, traços raciais e acordos com o mestre">
                <textarea
                  maxLength={10000}
                  rows="8"
                  value={c.notes}
                  onChange={(e) => update("notes", e.target.value)}
                />
              </Field>
            </>
  );
}
