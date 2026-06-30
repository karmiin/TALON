export async function loadToolModules(tools, context) {
  const host = document.querySelector("#dynamic-tool-views");
  if (!host) return [];

  const loaded = [];
  for (const tool of tools) {
    host.insertAdjacentHTML("beforeend", await loadText(tool.view));
    if (tool.module) {
      const module = await import(tool.module);
      if (typeof module.init === "function") {
        module.init(context);
      }
    }
    loaded.push(tool.id);
  }
  return loaded;
}

function loadText(path) {
  if (typeof fetch === "function") {
    return fetch(path).then((response) => {
      if (!response.ok) throw new Error(`Vista tool non caricabile: ${path}`);
      return response.text();
    });
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", path);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.responseText || "");
      } else {
        reject(new Error(`Vista tool non caricabile: ${path}`));
      }
    };
    xhr.onerror = () => reject(new Error(`Vista tool non caricabile: ${path}`));
    xhr.send();
  });
}
