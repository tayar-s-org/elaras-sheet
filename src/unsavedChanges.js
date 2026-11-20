import { createContext, useContext, useEffect } from 'react';

// Ref que o editor em modal consulta antes de fechar: formularios com edicao nao salva avisam por aqui.
export const UnsavedChangesContext = createContext(null);

export function useReportUnsavedChanges(isDirty) {
  const unsaved = useContext(UnsavedChangesContext);
  useEffect(() => {
    if (!unsaved) return undefined;
    unsaved.current = isDirty;
    return () => { unsaved.current = false; };
  }, [unsaved, isDirty]);
}
