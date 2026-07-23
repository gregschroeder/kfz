/**
 * KZQ — Kennzeichen Queue
 * Apple Shortcut (Watch-first; also iPhone / iPad / Mac).
 *
 * Import question fills the API key Text action — no secret in git.
 * Server-side normalize handles case / non-letters; shortcut keeps UI minimal.
 */

const OBJ = "\uFFFC";

/** Valid hex UUIDs only (Shortcuts breaks on non-hex). */
export const IDS = {
  apiKeyText: "A1000001-0000-4000-8000-000000000001",
  ask: "A1000002-0000-4000-8000-000000000002",
  setPrefix: "A1000003-0000-4000-8000-000000000003",
  post: "A1000004-0000-4000-8000-000000000004",
  gotPrefix: "A1000006-0000-4000-8000-000000000006",
  gotError: "A1000007-0000-4000-8000-000000000007",
  ifSavedGroup: "B1000001-0000-4000-8000-000000000001",
  resultNote: "A1000008-0000-4000-8000-000000000008",
  errNote: "A1000009-0000-4000-8000-000000000009",
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

function actionOutput(uuid, outputName) {
  return {
    OutputUUID: uuid,
    OutputName: outputName,
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

function attachOutput(uuid, outputName) {
  return textToken(OBJ, { "{0, 1}": actionOutput(uuid, outputName) });
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
        ${attachmentOnly(actionOutput(IDS.ask, "Provided Input"))}
      </dict>
    </dict>`);

  // 3 — POST
  const headers = dictField(`
              ${dictStringItem("Content-Type", plainText("application/json"))}
              ${dictStringItem("x-kfz-key", attachOutput(IDS.apiKeyText, "Text"))}
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

  // 4 — Read prefix from response (present only on success)
  actions.push(`<dict>
      <key>WFWorkflowActionIdentifier</key>
      <string>is.workflow.actions.getvalueforkey</string>
      <key>WFWorkflowActionParameters</key>
      <dict>
        <key>UUID</key>
        <string>${IDS.gotPrefix}</string>
        <key>WFDictionaryKey</key>
        <string>prefix</string>
        <key>WFInput</key>
        ${attachmentOnly(actionOutput(IDS.post, "Contents of URL"))}
      </dict>
    </dict>`);

  // 5 — If prefix empty → error
  actions.push(`<dict>
      <key>WFWorkflowActionIdentifier</key>
      <string>is.workflow.actions.conditional</string>
      <key>WFWorkflowActionParameters</key>
      <dict>
        <key>GroupingIdentifier</key>
        <string>${IDS.ifSavedGroup}</string>
        <key>WFControlFlowMode</key>
        <integer>0</integer>
        <key>WFCondition</key>
        <integer>100</integer>
        <key>WFConditionalActionString</key>
        <string></string>
        <key>WFInput</key>
        ${attachmentOnly(actionOutput(IDS.gotPrefix, "Dictionary Value"))}
      </dict>
    </dict>`);

  // 6 — error detail
  actions.push(`<dict>
      <key>WFWorkflowActionIdentifier</key>
      <string>is.workflow.actions.getvalueforkey</string>
      <key>WFWorkflowActionParameters</key>
      <dict>
        <key>UUID</key>
        <string>${IDS.gotError}</string>
        <key>WFDictionaryKey</key>
        <string>error</string>
        <key>WFInput</key>
        ${attachmentOnly(actionOutput(IDS.post, "Contents of URL"))}
      </dict>
    </dict>`);

  // 7 — error notification
  actions.push(`<dict>
      <key>WFWorkflowActionIdentifier</key>
      <string>is.workflow.actions.notification</string>
      <key>WFWorkflowActionParameters</key>
      <dict>
        <key>UUID</key>
        <string>${IDS.errNote}</string>
        <key>WFNotificationActionTitle</key>
        <string>KZQ failed</string>
        <key>WFNotificationActionBody</key>
        ${attachOutput(IDS.gotError, "Dictionary Value")}
      </dict>
    </dict>`);

  // 8 — Otherwise (got a prefix)
  actions.push(`<dict>
      <key>WFWorkflowActionIdentifier</key>
      <string>is.workflow.actions.conditional</string>
      <key>WFWorkflowActionParameters</key>
      <dict>
        <key>GroupingIdentifier</key>
        <string>${IDS.ifSavedGroup}</string>
        <key>WFControlFlowMode</key>
        <integer>1</integer>
      </dict>
    </dict>`);

  // 9 — success notification
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
          "{7, 1}": actionOutput(IDS.gotPrefix, "Dictionary Value"),
        })}
      </dict>
    </dict>`);

  // 10 — end if
  actions.push(`<dict>
      <key>WFWorkflowActionIdentifier</key>
      <string>is.workflow.actions.conditional</string>
      <key>WFWorkflowActionParameters</key>
      <dict>
        <key>GroupingIdentifier</key>
        <string>${IDS.ifSavedGroup}</string>
        <key>WFControlFlowMode</key>
        <integer>2</integer>
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
