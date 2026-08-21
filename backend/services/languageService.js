function detectLanguage(text) {
  return /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/u.test(String(text || ""))
    ? "arabic"
    : "english";
}

function chooseLanguage(language, english, arabic) {
  return language === "arabic" ? arabic : english;
}

module.exports = { chooseLanguage, detectLanguage };
