// Troca um arquivo guardado sem deixar a referência apontando para o vazio:
// envia o novo, grava a referência e só então apaga o antigo. Se gravar a referência falhar, o arquivo novo é apagado.
// Apagar é só limpeza: uma falha ali não desfaz a troca já gravada nem esconde o erro original.

const discard = (remove, path) => remove(path).catch(() => {});

export async function replaceStoredFile({ upload, persist, remove, previousPath }) {
  const path = await upload();
  try {
    await persist(path);
  } catch (error) {
    await discard(remove, path);
    throw error;
  }
  if (previousPath) await discard(remove, previousPath);
  return path;
}
