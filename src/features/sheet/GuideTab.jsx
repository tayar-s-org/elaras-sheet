import React from "react";
import Templates from "../../Templates.jsx";

// Guia de criação: raças do livro, arquétipos prontos e o criador de arquétipo próprio.
export default function GuideTab({ c, setC, setConfirm }) {
  return (
    <>
      <p className="intro">
        Comece pelo livro: aplique uma raça, carregue um arquétipo pronto ou monte o seu. Depois ajuste os detalhes nos módulos da ficha.
      </p>
      <Templates character={c} onChange={setC} onLoad={(title, action) => setConfirm({title, text:"A ficha atual será substituída. Salve seu PDF antes de continuar se quiser guardá-la.", action})} />
    </>
  );
}
