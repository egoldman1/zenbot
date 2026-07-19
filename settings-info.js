globalThis.ZENBOT_SETTING_INFO = Object.freeze({
  signature: {
    title: "Custom email signature",
    options: [
      ["Add a signature", "Benefit: every generated reply ends consistently with your chosen name, title or closing. Downside: it may duplicate a signature Zendesk already adds."],
      ["Leave blank", "Benefit: avoids duplicated sign-offs and lets Zendesk manage signatures. Downside: generated replies will not include your personal signature."],
    ],
  },
  tone: {
    title: "Custom tone instructions",
    options: [
      ["Add instructions", "Benefit: responses better match your personal or brand voice. Downside: very long or conflicting instructions can make replies less consistent."],
      ["Leave blank", "Benefit: uses Zenbot's tested warm support tone. Downside: it may feel less tailored to your organisation."],
    ],
  },
  responseLength: {
    title: "Default response length",
    options: [
      ["Concise", "Benefit: quick, focused replies. Downside: may omit optional explanation."],
      ["Balanced", "Benefit: combines brevity with enough context for most tickets. Downside: not ideal for unusually simple or complex cases."],
      ["Detailed", "Benefit: more explanation and practical guidance. Downside: slower to review and potentially too long for simple questions."],
    ],
  },
  autoSummarize: {
    title: "Automatic ticket summaries",
    options: [
      ["On", "Benefit: summary and next steps are ready when Zenbot opens. Downside: makes an extra model request whenever a changed ticket is opened."],
      ["Off", "Benefit: avoids summary requests you do not need. Downside: you must press Summarize ticket when you want one."],
    ],
  },
  responseSource: {
    title: "Use summary for responses",
    options: [
      ["On — Summary", "Benefit: gives the response model shorter, focused context and can reduce processing. Downside: a summary must exist first and may omit minor ticket details."],
      ["Off — Full ticket", "Benefit: the response model can use every rendered ticket detail immediately. Downside: long tickets use more input and can contain distracting history."],
    ],
  },
  summaryDetail: {
    title: "Summary detail level",
    options: [
      ["Low", "Benefit: fastest to scan. Downside: captures fewer facts and next steps."],
      ["Medium", "Benefit: a practical default for most tickets. Downside: may still be too broad or too brief for edge cases."],
      ["High", "Benefit: preserves more context and suggested actions. Downside: takes longer to read and may include less important details."],
    ],
  },
  summaryModel: {
    title: "Summary model",
    options: [
      ["gpt-5.6-luna", "Benefit: the current lightweight summary default. Downside: may be less capable on difficult ticket histories."],
      ["gpt-5.6-sol", "Benefit: stronger reasoning for complex tickets. Downside: may take longer and cost more."],
    ],
  },
  responseModel: {
    title: "Response model",
    options: [
      ["gpt-5.6-sol", "Benefit: the current default for complete, proactive responses. Downside: may take longer and cost more."],
      ["gpt-5.6-luna", "Benefit: potentially quicker and cheaper. Downside: may produce less complete replies on complex requests."],
    ],
  },
});
