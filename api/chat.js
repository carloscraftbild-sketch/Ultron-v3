
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido."
    });
  }

  const sleep = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  try {
    const {
      message,
      history = [],
      memories = []
    } = req.body || {};

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "A chave GEMINI_API_KEY não está configurada na Vercel."
      });
    }

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        error: "Digite uma mensagem."
      });
    }

    if (message.length > 4000) {
      return res.status(400).json({
        error: "A mensagem é muito longa."
      });
    }

    // Aceita os formatos de histórico usados pelo ULTRON.
    const normalizedHistory = Array.isArray(history)
      ? history
          .map((item) => {
            if (!item) return null;

            const role = item.role;
            let text = item.text;

            if (
              typeof text !== "string" &&
              Array.isArray(item.parts)
            ) {
              text = item.parts
                .map((part) => part?.text || "")
                .join("");
            }

            if (
              !["user", "model"].includes(role) ||
              typeof text !== "string" ||
              !text.trim()
            ) {
              return null;
            }

            return {
              role,
              parts: [{ text: text.slice(0, 2000) }]
            };
          })
          .filter(Boolean)
      : [];

    // Mantém apenas o contexto recente para reduzir a demora.
    const recentHistory = [];
    for (const item of normalizedHistory.slice(-6)) {
      const previous = recentHistory[recentHistory.length - 1];

      if (previous && previous.role === item.role) {
        previous.parts[0].text +=
          "\n" + item.parts[0].text;
      } else {
        recentHistory.push({
          role: item.role,
          parts: [{ text: item.parts[0].text }]
        });
      }
    }

    // Impede que o histórico termine com uma mensagem do usuário
    // duplicada no envio atual.
    if (
      recentHistory.length &&
      recentHistory[recentHistory.length - 1].role === "user"
    ) {
      recentHistory.pop();
    }

    const safeMemories = Array.isArray(memories)
      ? memories
          .filter((item) => typeof item === "string")
          .slice(0, 15)
          .map((item) => item.slice(0, 300))
      : [];

    const memoryContext = safeMemories.length
      ? "\n\nMEMÓRIAS IMPORTANTES:\n" +
        safeMemories.map((item) => "- " + item).join("\n") +
        "\nUse essas informações quando forem relevantes. Não invente lembranças."
      : "";

    const systemPrompt =
      "Você é ULTRON, um assistente pessoal inspirado no JARVIS. " +
      "Responda em português brasileiro. Seja direto e útil, " +
      "com respostas concisas por padrão. Explique mais quando necessário. " +
      "Ajude com programação, estudos e organização. " +
      "Não afirme possuir recursos que não foram implementados." +
      memoryContext;

    const contents = [
      ...recentHistory,
      {
        role: "user",
        parts: [{ text: message.trim() }]
      }
    ];

    let lastStatus = 503;
    let lastMessage = "O serviço do Gemini está temporariamente indisponível.";

    // No máximo duas tentativas para erros temporários.
    for (let attempt = 0; attempt < 2; attempt++) {
      let response;
      let data;

      try {
        response = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey
            },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{ text: systemPrompt }]
              },
              contents,
              generationConfig: {
                maxOutputTokens: 512
              }
            })
          }
        );

        data = await response.json();
      } catch (error) {
        lastStatus = 503;
        lastMessage = "Falha de conexão com o serviço do Gemini.";
        if (attempt === 0) {
          await sleep(700);
          continue;
        }
        break;
      }

      if (response.ok) {
        const reply = data.candidates?.[0]?.content?.parts
          ?.map((part) => part.text || "")
          .join("")
          .trim();

        if (!reply) {
          return res.status(502).json({
            error: "O Gemini não retornou uma resposta."
          });
        }

        return res.status(200).json({ reply });
      }

      lastStatus = response.status;
      lastMessage =
        data.error?.message ||
        "O Gemini não conseguiu processar a solicitação.";

      const retryable = [408, 429, 500, 503, 504].includes(
        response.status
      );

      if (!retryable || attempt === 1) break;

      await sleep(700);
    }

    console.error("Erro Gemini:", lastStatus, lastMessage);

    return res.status(502).json({
      error:
        lastStatus === 503
          ? "O Gemini continua temporariamente indisponível após uma nova tentativa."
          : lastStatus === 429
          ? "O limite de solicitações do Gemini foi atingido. Tente novamente mais tarde."
          : "O Gemini não conseguiu responder. Código de resposta: " +
            lastStatus
    });
  } catch (error) {
    console.error("Erro ULTRON:", error);

    return res.status(500).json({
      error: "Erro interno ao conversar com o ULTRON."
    });
  }
};
