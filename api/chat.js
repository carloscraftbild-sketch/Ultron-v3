
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido."
    });
  }

  try {
    const { message, history = [] } = req.body || {};
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "A chave do Gemini não está configurada na Vercel."
      });
    }

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        error: "Digite uma mensagem."
      });
    }

    if (message.length > 4000) {
      return res.status(400).json({
        error: "A mensagem ultrapassa o limite de 4000 caracteres."
      });
    }

    const safeHistory = Array.isArray(history)
      ? history
          .filter(item =>
            item &&
            ["user", "model"].includes(item.role) &&
            typeof item.text === "string"
          )
          .slice(-12)
          .map(item => ({
            role: item.role,
            parts: [{ text: item.text.slice(0, 4000) }]
          }))
      : [];

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
            parts: [{
              text: [
                "Seu nome é ULTRON.",
                "Você é um assistente pessoal inspirado no JARVIS.",
                "Fale em português brasileiro, com inteligência, clareza e objetividade.",
                "Ajude com programação, estudos, organização e perguntas gerais.",
                "Mantenha o contexto das mensagens anteriores da conversa.",
                "Não diga que possui memória permanente, acesso ao dispositivo ou recursos que não foram implementados."
              ].join(" ")
            }]
          },
          contents: [
            ...safeHistory,
            {
              role: "user",
              parts: [{ text: message.trim() }]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data.error?.message);

      return res.status(502).json({
        error: "Não consegui obter uma resposta do Gemini. Verifique a API e tente novamente."
      });
    }

    const reply = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    if (!reply) {
      return res.status(502).json({
        error: "O Gemini não retornou texto."
      });
    }

    return res.status(200).json({ reply });

  } catch (error) {
    console.error("ULTRON error:", error);

    return res.status(500).json({
      error: "Ocorreu um erro interno. Tente novamente."
    });
  }
};

