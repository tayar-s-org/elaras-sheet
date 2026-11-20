// Executa tarefas assíncronas uma de cada vez, na ordem em que chegaram. Uma tarefa que falha não trava as seguintes.

export function createSerialQueue() {
  let tail = Promise.resolve();
  return task => {
    const run = tail.then(task);
    tail = run.catch(() => {});
    return run;
  };
}
