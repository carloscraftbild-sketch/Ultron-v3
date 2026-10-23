
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido."
    });
  }

  try {
    const { message, history = [], memories = [] } = req.body || {};
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY não está configurada nas variáveis de ambiente da Vercel."
      });
    }

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        error: "Digite uma mensagem."
      });
    }

    if (message.length > 4000) {
      return res.status(400).json({
        error: "A mensagem ultrapassou o limite de 4.000 caracteres."
      });
    }

    // Aceita os dois formatos de histórico:
    // { role: "user", text: "..." }
    // { role: "user", parts: [{ text: "..." }] }
    const safeHistory = Array.isArray(history)
      ? history
          .filter(item =>
            item &&
            ["user", "model"].includes(item.role)
          )
          .map(item => {
            let text = "";

            if (typeof item.text === "string") {
              text = item.text;
            } else if (Array.isArray(item.parts)) {
              text = item.parts
                .filter(part => part && typeof part.text === "string")
                .map(part => part.text)
                .join("\n");
            }

            return {
              role: item.role,
              parts: [{ text: text.slice(0, 3000) }]
            };
          })
          .filter(item => item.parts[0].text.trim())
          .slice(-10)
      : [];

    // O histórico precisa começar com uma mensagem do usuário.
    while (safeHistory.length && safeHistory[0].role !== "user") {
      safeHistory.shift();
    }

    // Evita duas mensagens seguidas com o mesmo papel.
    const normalizedHistory = [];

    for (const item of safeHistory) {
      const previous = normalizedHistory[normalizedHistory.length - 1];

      if (previous && previous.role === item.role) {
        previous.parts[0].text += "\n" + item.parts[0].text;
      } else {
        normalizedHistory.push(item);
      }
    }

    const safeMemories = Array.isArray(memories)
      ? memories
          .filter(item => typeof item === "string")
          .slice(0, 30)
          .map(item => item.slice(0, 500))
      : [];

    const memoryContext = safeMemories.length
      ? "\n\nINFORMAÇÕES SALVAS PELO USUÁRIO:\n" +
        safeMemories.map(item => "- " + item).join("\n") +
        "\nUse essas informações quando forem relevantes. " +
        "Não invente lembranças que não estejam nesta lista."
      : "\n\nAinda não há informações salvas na memória.";

    const systemPrompt =
      "Você é ULTRON, um assistente pessoal inspirado no JARVIS. " +
      "Responda em português brasileiro, com clareza, inteligência e objetividade. " +
      "Seja direto por padrão e explique melhor quando necessário. " +
      "Ajude com programação, estudos e organização. " +
      "Ao gerar código, entregue exemplos completos e indique os arquivos necessários. " +
      "Não afirme possuir recursos que ainda não foram implementados." +
      memoryContext;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
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
          contents: [
            ...normalizedHistory,
            {
              role: "user",
              parts: [{ text: message.trim() }]
            }
          ],
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: 2048
          }
        })
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      // Registra detalhes no servidor, sem expor a chave secreta.
      console.error("Erro da API Gemini:", {
        status: response.status,
        message: data.error?.message || "Erro sem descrição"
      });

      if (response.status === 400) {
        return res.status(502).json({
          error: "O Gemini rejeitou a solicitação. Verifique o histórico e o formato enviado."
        });
      }

      if (response.status === 401 || response.status === 403) {
        return res.status(502).json({
          error: "A API do Gemini recusou o acesso. Confira a chave e as permissões no Google AI Studio."
        });
      }

      if (response.status === 404) {
        return res.status(502).json({
          error: "O modelo Gemini configurado não foi encontrado ou não está disponível para sua chave."
        });
      }

      if (response.status === 429) {
        return res.status(502).json({
          error: "O limite de solicitações do Gemini foi atingido. Aguarde e tente novamente."
        });
      }

      return res.status(502).json({
        error: "O Gemini não conseguiu responder. Código de resposta: " + response.status
      });
    }

    const reply = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    if (!reply) {
      console.error("Resposta Gemini sem texto:", JSON.stringify({
        finishReason: data.candidates?.[0]?.finishReason,
        blockReason: data.promptFeedback?.blockReason
      }));

      return res.status(502).json({
        error: "O Gemini não retornou texto. Tente reformular a mensagem."
      });
    }

    return res.status(200).json({ reply });

  } catch (error) {
    console.error("Erro interno ULTRON:", error?.message || error);

    return res.status(500).json({
      error: "Erro interno ao conversar com o ULTRON. Tente novamente."
    });
  }
};
