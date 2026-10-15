"use client";

// Erro no layout raiz (fora do error.tsx): página sem os estilos do app, só a mensagem e recarregar.

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="pt-BR">
      <body style={{ background: "#171512", color: "#eee", font: "18px system-ui", padding: 24 }}>
        <h1 style={{ fontSize: 24 }}>A Governanta deu erro</h1>
        <pre style={{ whiteSpace: "pre-wrap" }}>{error.message || error.digest || "erro desconhecido"}</pre>
        <button type="button" onClick={() => location.reload()} style={{ font: "inherit", padding: "8px 16px" }}>
          Recarregar
        </button>
      </body>
    </html>
  );
}
