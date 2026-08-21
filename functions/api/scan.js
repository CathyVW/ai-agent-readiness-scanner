const AI_BOT_NAMES = [
  "gptbot", "oai-searchbot", "chatgpt-user", "claude-web", "claudebot",
  "anthropic-ai", "google-extended", "perplexitybot", "perplexity-user",
  "bytespider", "ccbot", "cohere-ai", "applebot-extended", "meta-externalagent"
];

async function safeFetch(url, options = {}) {
  try {
    return await fetch(url, { redirect: "follow", cf: { cacheTtl: 0 }, ...options });
  } catch {
    return null;
  }
}

function getTarget(value) {
  const target = new URL(value);
  if (!["http:", "https:"].includes(target.protocol)) {
    throw new Error("Alleen http- en https-URL's zijn toegestaan.");
  }
  return target;
}

function originOf(target) {
  return `${target.protocol}//${target.host}`;
}

async function robotsCheck(origin) {
  const response = await safeFetch(`${origin}/robots.txt`);
  if (!response || response.status !== 200) {
    return { status: "fail", message: "robots.txt niet bereikbaar of geen HTTP 200." };
  }
  const text = await response.text();
  if (!/user-agent/i.test(text)) {
    return { status: "fail", message: "robots.txt bevat geen User-agent directive." };
  }
  return { status: "pass", message: "robots.txt gevonden met geldige User-agent directives.", raw: text };
}

async function sitemapCheck(origin, robotsText) {
  if (/sitemap\s*:/i.test(robotsText)) {
    return { status: "pass", message: "Sitemap directive gevonden in robots.txt." };
  }
  const response = await safeFetch(`${origin}/sitemap.xml`);
  if (response && response.status === 200) {
    const text = await response.text();
    if (/<(?:urlset|sitemapindex)\b/i.test(text)) {
      return { status: "pass", message: "/sitemap.xml bevat geldige sitemap-XML." };
    }
  }
  return { status: "fail", message: "Geen geldige sitemap gevonden." };
}

async function linkHeadersCheck(origin) {
  const response = await safeFetch(origin);
  if (!response) return { status: "fail", message: "Homepage niet bereikbaar." };
  const link = response.headers.get("link") || "";
  const relevant = ["service-desc", "describedby", "api-catalog", "service-doc"];
  if (relevant.some((rel) => link.includes(rel))) {
    return { status: "pass", message: "Agent-relevante Link response header gevonden." };
  }
  return { status: "fail", message: "Geen agent-relevante Link response header gevonden." };
}

async function dnsAidCheck(hostname) {
  try {
    const response = await safeFetch(`https://cloudflare-dns.com/dns-query?name=_agents.${hostname}&type=HTTPS`, { headers: { Accept: "application/dns-json" } });
    if (!response) return { status: "unableToCheck", message: "DNS lookup mislukt." };
    const data = await response.json();
    return data.Answer?.length ? { status: "pass", message: "DNS-AID record gevonden." } : { status: "fail", message: "Geen DNS-AID record gevonden." };
  } catch {
    return { status: "unableToCheck", message: "DNS-AID check kon niet worden uitgevoerd." };
  }
}

async function markdownCheck(origin) {
  const response = await safeFetch(origin, { headers: { Accept: "text/markdown" } });
  if (!response) return { status: "fail", message: "Homepage niet bereikbaar voor Markdown-check." };
  const type = response.headers.get("content-type") || "";
  return type.includes("text/markdown") ? { status: "pass", message: "Accept: text/markdown geeft Markdown terug." } : { status: "fail", message: "Markdown negotiation niet gedetecteerd." };
}

function aiRulesCheck(robotsText) {
  if (!robotsText) return { status: "fail", message: "robots.txt niet beschikbaar." };
  const lower = robotsText.toLowerCase();
  const explicit = AI_BOT_NAMES.some((name) => lower.includes(name));
  const wildcard = /user-agent:\s*\*/i.test(robotsText);
  return explicit || wildcard ? { status: "pass", message: "AI-bot- of wildcard-regels gevonden." } : { status: "fail", message: "Geen AI-botregels gevonden." };
}

function contentSignalsCheck(robotsText) {
  return robotsText && /content-signal\s*:/i.test(robotsText) ? { status: "pass", message: "Content-Signal directive gevonden." } : { status: "fail", message: "Geen Content-Signal directive gevonden." };
}

async function jsonCheck(origin, paths, validate) {
  for (const path of paths) {
    const response = await safeFetch(`${origin}${path}`);
    if (!response || response.status !== 200) continue;
    try {
      const data = await response.json();
      if (validate(data)) return { status: "pass", message: `Geldig bestand gevonden op ${path}.` };
    } catch {}
  }
  return { status: "fail", message: `Geen geldig bestand gevonden op ${paths.join(" of ")}.` };
}

async function webBotAuthCheck(origin) {
  const response = await safeFetch(`${origin}/.well-known/http-message-signatures-directory`);
  if (response && response.status === 200) {
    try {
      const data = await response.json();
      if (data?.keys || Array.isArray(data)) return { status: "pass", message: "Web Bot Auth-directory gevonden." };
    } catch {}
  }
  return { status: "neutral", message: "Web Bot Auth niet gevonden; optioneel." };
}

function commerceCheck(name) {
  return { status: "neutral", message: `${name}: niet geïmplementeerd in deze MVP.` };
}

function readinessLevel(checks) {
  const d = checks.discoverability;
  const c = checks.contentAccessibility;
  const b = checks.botAccessControl;
  const x = checks.discovery;
  const level1 = [d.robotsTxt, d.sitemap, d.linkHeaders].filter((check) => check.status === "pass").length >= 2;
  const level2 = level1 && b.robotsTxtAiRules.status === "pass" && b.contentSignals.status === "pass";
  const level3 = level2 && c.markdownNegotiation.status === "pass";
  const integrationPasses = [x.mcpServerCard, x.a2aAgentCard, x.agentSkills, x.apiCatalog].filter((check) => check.status === "pass").length;
  const level4 = level3 && integrationPasses >= 1;
  const auth = [x.oauthDiscovery, x.oauthProtectedResource, x.authMd].some((check) => check.status === "pass");
  const level5 = level4 && [b.webBotAuth.status === "pass", integrationPasses === 4, auth].filter(Boolean).length >= 2;
  if (level5) return { level: 5, name: "Agent-Native" };
  if (level4) return { level: 4, name: "Agent-Integrated" };
  if (level3) return { level: 3, name: "Agent-Readable" };
  if (level2) return { level: 2, name: "Bot-Aware" };
  if (level1) return { level: 1, name: "Basic Web Presence" };
  return { level: 0, name: "Not Ready" };
}

export async function onRequest(context) {
  const { request } = context;
  let input;
  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    input = body.url;
  } else {
    input = new URL(request.url).searchParams.get("url");
  }
  if (!input) return jsonResponse({ error: "Parameter 'url' is verplicht." }, 400);

  let target;
  try {
    target = getTarget(input);
  } catch (error) {
    return jsonResponse({ error: error.message || "Ongeldige URL." }, 400);
  }

  const origin = originOf(target);
  const robots = await robotsCheck(origin);
  const robotsText = robots.raw || "";
  delete robots.raw;

  const [sitemap, links, dnsAid, markdown, webBotAuth, mcp, a2a, skills, apiCatalog, oauthDiscovery, oauthProtectedResource, authMdResponse] = await Promise.all([
    sitemapCheck(origin, robotsText),
    linkHeadersCheck(origin),
    dnsAidCheck(target.hostname),
    markdownCheck(origin),
    webBotAuthCheck(origin),
    jsonCheck(origin, ["/.well-known/mcp/server-card.json", "/.well-known/mcp/server-cards.json", "/.well-known/mcp.json"], (data) => Boolean(data?.serverInfo?.name || data?.name)),
    jsonCheck(origin, ["/.well-known/agent-card.json"], (data) => Boolean(data?.name && data?.version && data?.supportedInterfaces)),
    jsonCheck(origin, ["/.well-known/agent-skills/index.json", "/.well-known/skills/index.json"], (data) => Array.isArray(data?.skills)),
    jsonCheck(origin, ["/.well-known/api-catalog"], (data) => Array.isArray(data?.linkset)),
    jsonCheck(origin, ["/.well-known/openid-configuration", "/.well-known/oauth-authorization-server"], (data) => Boolean(data?.issuer && data?.authorization_endpoint)),
    jsonCheck(origin, ["/.well-known/oauth-protected-resource"], (data) => Boolean(data?.resource && data?.authorization_servers)),
    safeFetch(`${origin}/auth.md`),
  ]);

  const checks = {
    discoverability: { robotsTxt: robots, sitemap, linkHeaders: links, dnsAid },
    contentAccessibility: { markdownNegotiation: markdown },
    botAccessControl: { robotsTxtAiRules: aiRulesCheck(robotsText), contentSignals: contentSignalsCheck(robotsText), webBotAuth },
    discovery: {
      mcpServerCard: mcp,
      a2aAgentCard: a2a,
      agentSkills: skills,
      apiCatalog,
      oauthDiscovery,
      oauthProtectedResource,
      authMd: authMdResponse?.status === 200 ? { status: "pass", message: "/auth.md gevonden." } : { status: "fail", message: "Geen /auth.md gevonden." },
    },
    commerce: { x402: commerceCheck("x402"), mpp: commerceCheck("MPP"), ucp: commerceCheck("UCP"), acp: commerceCheck("ACP"), ap2: commerceCheck("AP2") },
  };

  const level = readinessLevel(checks);
  return jsonResponse({ url: target.href, scanned_at: new Date().toISOString(), ...level, level_name: level.name, checks });
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" },
  });
}
