async function handle(res) {
  if (!res.ok) {
    // sesión vencida o inexistente (solo pasa en modo cloud): avisar al shell
    // para que muestre la pantalla de login en vez de errores sueltos
    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent("homeos:sin-sesion"));
    }
    let detail = `Error ${res.status}`;
    try {
      const data = await res.json();
      if (data.detail) detail = data.detail;
    } catch {
      /* respuesta sin JSON */
    }
    const err = new Error(detail);
    // el status viaja con el error: un 409 de "accion en curso" no se trata
    // igual que un fallo real, y sin esto el caller solo tendria texto
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const apiGet = (url) => fetch(url).then(handle);

export const apiPost = (url, body) =>
  fetch(url, {
    method: "POST",
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).then(handle);

export const apiPut = (url, body) =>
  fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(handle);

export const apiDelete = (url) => fetch(url, { method: "DELETE" }).then(handle);

export const apiUpload = (url, file) => {
  const form = new FormData();
  form.append("file", file);
  return fetch(url, { method: "POST", body: form }).then(handle);
};
