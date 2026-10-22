
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido." });
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
      return res.status(400).json({ error: "Digite uma mensagem." });
    }

    if (message.length > 4000) {
      return res.status(400).json({ error: "Mensagem muito longa." });
    }

    const safeHistory = Array.isArray(history)
      ? history
          .filter(item =>
            item &&
            ["user", "model"].includes(item.role) &&
            typeof item.text === "string"
          )
          .slice(-10)
          .map(item => ({
            role: item.role,
            parts: [{ text: item.text.slice(0, 3000) }]
          }))
      : [];

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: "Você é ULTRON, um assistente pessoal inspirado no JARVIS. Responda em português brasileiro, com clareza, inteligência e objetividade. Seja direto por padrão, mas explique melhor quando necessário. Ajude com programação, estudos e organização. Não afirme possuir recursos que ainda não foram implementados."
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
            temperature: 0.6,
            maxOutputTokens: 512
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API:", data.error?.message);
      return res.status(502).json({
        error: "O Gemini não conseguiu responder. Verifique a API e tente novamente."
      });
    }

    const reply = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    if (!reply) {
      return res.status(502).json({
        error: "O Gemini não retornou uma resposta."
      });
    }

    return res.status(200).json({ reply });
  } catch (error) {
    console.error("Erro ULTRON:", error);
    return res.status(500).json({
      error: "Erro interno ao conversar com o ULTRON."
    });
  }
};
