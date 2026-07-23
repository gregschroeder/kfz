/**
 * KZQ — Kennzeichen Queue
 * Apple Shortcut (Watch-first; also iPhone / iPad / Mac).
 *
 * Import question fills the API key Text action — no secret in git.
 * Server-side normalize handles case / non-letters.
 *
 * Keep actions minimal: German iOS localizes magic-variable names;
 * attachments use OutputUUID only (no OutputName).
 */

const OBJ = "\uFFFC";

/** Valid hex UUIDs only. */
export const IDS = {
  apiKeyText: "A1000001-0000-4000-8000-000000000001",
  ask: "A1000002-0000-4000-8000-000000000002",
  setPrefix: "A1000003-0000-4000-8000-000000000003",
  post: "A1000004-0000-4000-8000-000000000004",
  resultNote: "A1000005-0000-4000-8000-000000000005",
};

const DEFAULT_FUNCTIONS_URL =
  "https://wchzccrcqlxgsftjbpgn.supabase.co/functions/v1/kfz-capture";

function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function textToken(string, attachments = {}) {
  const attachXml = Object.entries(attachments)
    .map(
      ([range, att]) => `
            <key>${esc(range)}</key>
            <dict>
              ${Object.entries(att)
                .map(([k, v]) => `<key>${esc(k)}</key>\n              <string>${esc(v)}</string>`)
                .join("\n              ")}
            </dict>`,
    )
    .join("");
  return `<dict>
          <key>Value</key>
          <dict>
            <key>attachmentsByRange</key>
            <dict>${attachXml}
            </dict>
            <key>string</key>
            <string>${esc(string)}</string>
          </dict>
          <key>WFSerializationType</key>
          <string>WFTextTokenString</string>
        </dict>`;
}

/** Action output ref — UUID only (OutputName is localized on device). */
function actionOutput(uuid) {
  return {
    OutputUUID: uuid,
    Type: "ActionOutput",
  };
}

function variableRef(name) {
  return {
    VariableName: name,
    Type: "Variable",
  };
}

function plainText(s) {
  return textToken(s, {});
}

function attachOutput(uuid) {
  return textToken(OBJ, { "{0, 1}": actionOutput(uuid) });
}

function attachVariable(name) {
  return textToken(OBJ, { "{0, 1}": variableRef(name) });
}

function attachmentOnly(att) {
  return `<dict>
          <key>Value</key>
          <dict>
            ${Object.entries(att)
              .map(([k, v]) => `<key>${esc(k)}</key>\n            <string>${esc(v)}</string>`)
              .join("\n            ")}
          </dict>
          <key>WFSerializationType</key>
          <string>WFTextTokenAttachment</string>
        </dict>`;
}

function dictStringItem(key, valueXml) {
  return `<dict>
                <key>WFItemType</key>
                <integer>0</integer>
                <key>WFKey</key>
                ${plainText(key)}
                <key>WFValue</key>
                ${valueXml}
              </dict>`;
}

function dictField(itemsXml) {
  return `<dict>
          <key>Value</key>
          <dict>
            <key>WFDictionaryFieldValueItems</key>
            <array>
              ${itemsXml}
            </array>
          </dict>
          <key>WFSerializationType</key>
          <string>WFDictionaryFieldValue</string>
        </dict>`;
}

/**
 * @param {{ functionsUrl?: string }} [opts]
 * @returns {string} XML plist
 */
export function buildShortcutPlist(opts = {}) {
  const functionsUrl = opts.functionsUrl ?? DEFAULT_FUNCTIONS_URL;
  const actions = [];

  // 0 — Household key (import question)
  actions.push(`<dict>
      <key>WFWorkflowActionIdentifier</key>
      <string>is.workflow.actions.gettext</string>
      <key>WFWorkflowActionParameters</key>
      <dict>
        <key>UUID</key>
        <string>${IDS.apiKeyText}</string>
        <key>WFTextActionText</key>
        <string></string>
      </dict>
    </dict>`);

  // 1 — Ask for prefix
  actions.push(`<dict>
      <key>WFWorkflowActionIdentifier</key>
      <string>is.workflow.actions.ask</string>
      <key>WFWorkflowActionParameters</key>
      <dict>
        <key>UUID</key>
        <string>${IDS.ask}</string>
        <key>WFAskActionPrompt</key>
        <string>KZQ</string>
        <key>WFInputType</key>
        <string>Text</string>
      </dict>
    </dict>`);

  // 2 — Remember as Prefix
  actions.push(`<dict>
      <key>WFWorkflowActionIdentifier</key>
      <string>is.workflow.actions.setvariable</string>
      <key>WFWorkflowActionParameters</key>
      <dict>
        <key>UUID</key>
        <string>${IDS.setPrefix}</string>
        <key>WFVariableName</key>
        <string>Prefix</string>
        <key>WFInput</key>
        ${attachmentOnly(actionOutput(IDS.ask))}
      </dict>
    </dict>`);

  // 3 — POST
  const headers = dictField(`
              ${dictStringItem("Content-Type", plainText("application/json"))}
              ${dictStringItem("x-kfz-key", attachOutput(IDS.apiKeyText))}
            `);
  const jsonBody = dictField(`
              ${dictStringItem("prefix", attachVariable("Prefix"))}
              ${dictStringItem("source", plainText("watch"))}
            `);

  actions.push(`<dict>
      <key>WFWorkflowActionIdentifier</key>
      <string>is.workflow.actions.downloadurl</string>
      <key>WFWorkflowActionParameters</key>
      <dict>
        <key>UUID</key>
        <string>${IDS.post}</string>
        <key>ShowHeaders</key>
        <true/>
        <key>WFHTTPMethod</key>
        <string>POST</string>
        <key>WFHTTPBodyType</key>
        <string>JSON</string>
        <key>WFURL</key>
        ${plainText(functionsUrl)}
        <key>WFHTTPHeaders</key>
        ${headers}
        <key>WFJSONValues</key>
        ${jsonBody}
      </dict>
    </dict>`);

  // 4 — Notify using Prefix variable (not response parsing)
  actions.push(`<dict>
      <key>WFWorkflowActionIdentifier</key>
      <string>is.workflow.actions.notification</string>
      <key>WFWorkflowActionParameters</key>
      <dict>
        <key>UUID</key>
        <string>${IDS.resultNote}</string>
        <key>WFNotificationActionTitle</key>
        <string>KZQ</string>
        <key>WFNotificationActionBody</key>
        ${textToken(`Queued ${OBJ}`, {
          "{7, 1}": variableRef("Prefix"),
        })}
      </dict>
    </dict>`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>WFWorkflowClientVersion</key>
  <string>1300.1.0</string>
  <key>WFWorkflowClientRelease</key>
  <string>18.0</string>
  <key>WFWorkflowMinimumClientVersion</key>
  <integer>900</integer>
  <key>WFWorkflowMinimumClientVersionString</key>
  <string>900</string>
  <key>WFWorkflowName</key>
  <string>KZQ</string>
  <key>WFWorkflowHasOutputFallback</key>
  <false/>
  <key>WFWorkflowHasShortcutInputVariables</key>
  <false/>
  <key>WFWorkflowIcon</key>
  <dict>
    <key>WFWorkflowIconGlyphNumber</key>
    <integer>59511</integer>
    <key>WFWorkflowIconStartColor</key>
    <integer>4278222847</integer>
  </dict>
  <key>WFWorkflowTypes</key>
  <array>
    <string>Watch</string>
    <string>NCWidget</string>
  </array>
  <key>WFWorkflowImportQuestions</key>
  <array>
    <dict>
      <key>ActionIndex</key>
      <integer>0</integer>
      <key>Category</key>
      <string>Parameter</string>
      <key>DefaultValue</key>
      <string></string>
      <key>ParameterKey</key>
      <string>WFTextActionText</string>
      <key>Text</key>
      <string>Household KFZ API key</string>
    </dict>
  </array>
  <key>WFWorkflowInputContentItemClasses</key>
  <array>
    <string>WFStringContentItem</string>
  </array>
  <key>WFWorkflowOutputContentItemClasses</key>
  <array/>
  <key>WFWorkflowActions</key>
  <array>
    ${actions.join("\n    ")}
  </array>
</dict>
</plist>
`;
}
