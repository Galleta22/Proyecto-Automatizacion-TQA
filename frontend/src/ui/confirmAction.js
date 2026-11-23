let queue = Promise.resolve();
export function confirmAction(message, { title = "Confirma la acción", confirmLabel = "Confirmar" } = {}) {
  const run = () => new Promise((resolve) => {
    const origin = document.activeElement;
    const dialog = document.createElement("dialog");
    dialog.className = "ui-confirm";
    const heading = document.createElement("h2"); heading.id = "confirmation-title"; heading.textContent = title;
    dialog.setAttribute("aria-labelledby", heading.id);
    const description = document.createElement("p"); description.textContent = message;
    const actions = document.createElement("div"); actions.className = "ui-confirm-actions";
    const cancel = document.createElement("button"); cancel.textContent = "Cancelar"; cancel.className = "btn-secondary";
    const accept = document.createElement("button"); accept.textContent = confirmLabel; accept.className = "btn-primary";
    actions.append(cancel, accept); dialog.append(heading, description, actions); document.body.append(dialog);
    const finish = (value) => { dialog.close(); dialog.remove(); if (origin?.isConnected) origin.focus(); resolve(value); };
    cancel.onclick = () => finish(false); accept.onclick = () => finish(true);
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(false); });
    dialog.showModal(); cancel.focus();
  });
  const result = queue.then(run); queue = result.catch(() => false); return result;
}
