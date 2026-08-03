/**
 * KZQ — Kennzeichen Queue
 * Apple Shortcut (Mac / iPhone / iPad / Watch).
 *
 * Flow (inside Repeat so Retry can re-dictate):
 *   1. Dictate Text (After Short Pause, de-DE)
 *   2. Set Spoken ← dictate; Text(Spoken) for Replace wiring
 *   3. Strip non-letters → Set Prefix
 *   4. If Prefix has any value:
 *        Menu — Queue / Retry / Edit / Cancel
 *          Queue → POST + exit
 *          Retry → next dictate attempt
 *          Edit  → Ask → POST + exit
 *          Cancel → exit
 *      Otherwise:
 *        Ask for Input (blank) → strip → POST + exit
 *
 * Replace Text WFInput must be WFTextTokenString (not Attachment).
 * Do not init Prefix to "" — blank can count as “has value”.
 */

const OBJ = "\uFFFC";

export const IDS = {
  apiKeyText:     "A1000001-0000-4000-8000-000000000001",
  repeatStart:    "A1000040-0000-4000-8000-000000000040",
  dictate:        "A1000002-0000-4000-8000-000000000002",
  setSpoken:      "A100002E-0000-4000-8000-00000000002E",
  spokenText:     "A1000030-0000-4000-8000-000000000030",
  strip:          "A100001C-0000-4000-8000-00000000001C",
  setPrefix:      "A100001F-0000-4000-8000-00000000001F",
  promptLabel:    "A100002F-0000-4000-8000-00000000002F",
  menuStart:      "A1000022-0000-4000-8000-000000000022",
  menuQueue:      "A1000023-0000-4000-8000-000000000023",
  menuRetry:      "A1000041-0000-4000-8000-000000000041",
  menuEdit:       "A1000024-0000-4000-8000-000000000024",
  menuCancel:     "A1000025-0000-4000-8000-000000000025",
  menuEnd:        "A1000026-0000-4000-8000-000000000026",
  menuExit:       "A1000032-0000-4000-8000-000000000032",
  askEdit:        "A1000013-0000-4000-8000-000000000013",
  editStrip:      "A1000014-0000-4000-8000-000000000014",
  setEditPrefix:  "A1000017-0000-4000-8000-000000000017",
  askBlank:       "A1000028-0000-4000-8000-000000000028",
  blankStrip:     "A1000029-0000-4000-8000-000000000029",
  setBlankPrefix: "A100002C-0000-4000-8000-00000000002C",
  postQueue:      "A1000018-0000-4000-8000-000000000018",
  noteQueue:      "A1000019-0000-4000-8000-000000000019",
  exitQueue:      "A1000042-0000-4000-8000-000000000042",
  postEdit:       "A1000043-0000-4000-8000-000000000043",
  noteEdit:       "A1000044-0000-4000-8000-000000000044",
  exitEdit:       "A1000045-0000-4000-8000-000000000045",
  postBlank:      "A1000046-0000-4000-8000-000000000046",
  noteBlank:      "A1000047-0000-4000-8000-000000000047",
  exitBlank:      "A1000048-0000-4000-8000-000000000048",
  repeatEnd:      "A1000049-0000-4000-8000-000000000049",
};

const GROUPS = {
  retryLoop:   "B100000A-0000-4000-8000-00000000000A",
  prefixIf:    "B1000005-0000-4000-8000-000000000005",
  confirmMenu: "B1000006-0000-4000-8000-000000000006",
};

const DEFAULT_FUNCTIONS_URL =
  "https://wchzccrcqlxgsftjbpgn.supabase.co/functions/v1/kfz-capture";

// POSIX alpha — includes Ä/Ö/Ü. Hand export confirmed plain-string find + regex.
const LETTER_STRIP = "[^[:alpha:]]";

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
  const att = { OutputUUID: uuid, Type: "ActionOutput" };
  if (outputName) att.OutputName = outputName;
  return att;
}

function variableRef(name) {
  return { VariableName: name, Type: "Variable" };
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

/** WFTextTokenAttachment — Set Variable WFInput (bare magic var). */
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

/**
 * WFInput for Replace — MUST be WFTextTokenString.
 * Hand-exported Replace uses this; WFTextTokenAttachment yields empty output.
 */
function textActionInput(att) {
  return textToken(OBJ, { "{0, 1}": att });
}

function conditionInputFromVariable(name) {
  return `<dict>
          <key>Type</key>
          <string>Variable</string>
          <key>Variable</key>
          <dict>
            <key>Value</key>
            <dict>
              <key>Type</key>
              <string>Variable</string>
              <key>VariableName</key>
              <string>${esc(name)}</string>
            </dict>
            <key>WFSerializationType</key>
            <string>WFTextTokenAttachment</string>
          </dict>
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

function action(id, paramsXml) {
  return `<dict>
      <key>WFWorkflowActionIdentifier</key>
      <string>${id}</string>
      <key>WFWorkflowActionParameters</key>
      <dict>
        ${paramsXml}
      </dict>
    </dict>`;
}

/** Strip non-letters → Set Variable "Prefix". */
function sanitizeToPrefix({ inputAtt, stripId, setId }) {
  return [
    action(
      "is.workflow.actions.text.replace",
      `<key>UUID</key><string>${stripId}</string>
        <key>WFReplaceTextFind</key><string>${esc(LETTER_STRIP)}</string>
        <key>WFReplaceTextReplace</key><string></string>
        <key>WFReplaceTextCaseSensitive</key><false/>
        <key>WFReplaceTextRegularExpression</key><true/>
        <key>WFInput</key>${textActionInput(inputAtt)}`,
    ),
    action(
      "is.workflow.actions.setvariable",
      `<key>UUID</key><string>${setId}</string>
        <key>WFVariableName</key><string>Prefix</string>
        <key>WFInput</key>${attachmentOnly(actionOutput(stripId, "Updated Text"))}`,
    ),
  ];
}

function postNotifyExit(functionsUrl, { postId, noteId, exitId }) {
  const headers = dictField(`
              ${dictStringItem("Content-Type", plainText("application/json"))}
              ${dictStringItem("x-kfz-key", attachOutput(IDS.apiKeyText))}
            `);
  const jsonBody = dictField(`
              ${dictStringItem("prefix", attachVariable("Prefix"))}
              ${dictStringItem("source", plainText("watch"))}
            `);
  return [
    action(
      "is.workflow.actions.downloadurl",
      `<key>UUID</key><string>${postId}</string>
        <key>ShowHeaders</key><true/>
        <key>WFHTTPMethod</key><string>POST</string>
        <key>WFHTTPBodyType</key><string>JSON</string>
        <key>WFURL</key>${plainText(functionsUrl)}
        <key>WFHTTPHeaders</key>${headers}
        <key>WFJSONValues</key>${jsonBody}`,
    ),
    action(
      "is.workflow.actions.notification",
      `<key>UUID</key><string>${noteId}</string>
        <key>WFNotificationActionTitle</key><string>KZQ</string>
        <key>WFNotificationActionBody</key>
        ${textToken(`Queued ${OBJ}`, { "{7, 1}": variableRef("Prefix") })}`,
    ),
    action(
      "is.workflow.actions.exit",
      `<key>UUID</key><string>${exitId}</string>`,
    ),
  ];
}

/**
 * @param {{ functionsUrl?: string }} [opts]
 * @returns {string} XML plist
 */
export function buildShortcutPlist(opts = {}) {
  const functionsUrl = opts.functionsUrl ?? DEFAULT_FUNCTIONS_URL;
  const actions = [];

  actions.push(
    action(
      "is.workflow.actions.gettext",
      `<key>UUID</key><string>${IDS.apiKeyText}</string>
        <key>WFTextActionText</key><string></string>`,
    ),
  );

  // Retry loops back to Dictate (cap attempts so a runaway can't spin forever)
  actions.push(
    action(
      "is.workflow.actions.repeat.count",
      `<key>UUID</key><string>${IDS.repeatStart}</string>
        <key>GroupingIdentifier</key><string>${GROUPS.retryLoop}</string>
        <key>WFControlFlowMode</key><integer>0</integer>
        <key>WFRepeatCount</key><integer>20</integer>`,
    ),
  );

  actions.push(
    action(
      "is.workflow.actions.dictatetext",
      `<key>UUID</key><string>${IDS.dictate}</string>
        <key>WFDictateTextStopListening</key><string>After Short Pause</string>
        <key>WFSpeechLanguage</key><string>de-DE</string>`,
    ),
  );

  actions.push(
    action(
      "is.workflow.actions.setvariable",
      `<key>UUID</key><string>${IDS.setSpoken}</string>
        <key>WFVariableName</key><string>Spoken</string>
        <key>WFInput</key>${attachmentOnly(actionOutput(IDS.dictate, "Dictated Text"))}`,
    ),
  );

  actions.push(
    action(
      "is.workflow.actions.gettext",
      `<key>UUID</key><string>${IDS.spokenText}</string>
        <key>WFTextActionText</key>${attachVariable("Spoken")}`,
    ),
  );

  actions.push(
    ...sanitizeToPrefix({
      inputAtt: actionOutput(IDS.spokenText, "Text"),
      stripId: IDS.strip,
      setId: IDS.setPrefix,
    }),
  );

  actions.push(
    action(
      "is.workflow.actions.conditional",
      `<key>GroupingIdentifier</key><string>${GROUPS.prefixIf}</string>
        <key>WFControlFlowMode</key><integer>0</integer>
        <key>WFCondition</key><integer>100</integer>
        <key>WFInput</key>${conditionInputFromVariable("Prefix")}`,
    ),
  );

  const QUEUE_LABEL = "✅  QUEUE";
  const RETRY_LABEL = "🔄  RETRY";
  const EDIT_LABEL = "✏️  EDIT";
  const CANCEL_LABEL = "❌  CANCEL";

  actions.push(
    action(
      "is.workflow.actions.gettext",
      `<key>UUID</key><string>${IDS.promptLabel}</string>
        <key>WFTextActionText</key>
        ${textToken(`Prefix: ${OBJ}`, {
          "{8, 1}": variableRef("Prefix"),
        })}`,
    ),
  );

  actions.push(
    action(
      "is.workflow.actions.choosefrommenu",
      `<key>UUID</key><string>${IDS.menuStart}</string>
        <key>GroupingIdentifier</key><string>${GROUPS.confirmMenu}</string>
        <key>WFControlFlowMode</key><integer>0</integer>
        <key>WFMenuPrompt</key>${attachOutput(IDS.promptLabel)}
        <key>WFMenuItems</key>
        <array>
          <string>${esc(QUEUE_LABEL)}</string>
          <string>${esc(RETRY_LABEL)}</string>
          <string>${esc(EDIT_LABEL)}</string>
          <string>${esc(CANCEL_LABEL)}</string>
        </array>`,
    ),
  );

  // Queue → POST + exit
  actions.push(
    action(
      "is.workflow.actions.choosefrommenu",
      `<key>UUID</key><string>${IDS.menuQueue}</string>
        <key>GroupingIdentifier</key><string>${GROUPS.confirmMenu}</string>
        <key>WFControlFlowMode</key><integer>1</integer>
        <key>WFMenuItemTitle</key><string>${esc(QUEUE_LABEL)}</string>`,
    ),
  );
  actions.push(
    ...postNotifyExit(functionsUrl, {
      postId: IDS.postQueue,
      noteId: IDS.noteQueue,
      exitId: IDS.exitQueue,
    }),
  );

  // Retry → empty branch; loop continues to next Dictate
  actions.push(
    action(
      "is.workflow.actions.choosefrommenu",
      `<key>UUID</key><string>${IDS.menuRetry}</string>
        <key>GroupingIdentifier</key><string>${GROUPS.confirmMenu}</string>
        <key>WFControlFlowMode</key><integer>1</integer>
        <key>WFMenuItemTitle</key><string>${esc(RETRY_LABEL)}</string>`,
    ),
  );

  // Edit → Ask → POST + exit
  actions.push(
    action(
      "is.workflow.actions.choosefrommenu",
      `<key>UUID</key><string>${IDS.menuEdit}</string>
        <key>GroupingIdentifier</key><string>${GROUPS.confirmMenu}</string>
        <key>WFControlFlowMode</key><integer>1</integer>
        <key>WFMenuItemTitle</key><string>${esc(EDIT_LABEL)}</string>`,
    ),
  );
  actions.push(
    action(
      "is.workflow.actions.ask",
      `<key>UUID</key><string>${IDS.askEdit}</string>
        <key>WFAskActionPrompt</key>
        ${textToken(`Prefix: ${OBJ}`, { "{8, 1}": variableRef("Prefix") })}
        <key>WFAskActionDefaultAnswer</key>${attachVariable("Prefix")}
        <key>WFInputType</key><string>Text</string>`,
    ),
  );
  actions.push(
    ...sanitizeToPrefix({
      inputAtt: actionOutput(IDS.askEdit, "Provided Input"),
      stripId: IDS.editStrip,
      setId: IDS.setEditPrefix,
    }),
  );
  actions.push(
    ...postNotifyExit(functionsUrl, {
      postId: IDS.postEdit,
      noteId: IDS.noteEdit,
      exitId: IDS.exitEdit,
    }),
  );

  // Cancel → exit
  actions.push(
    action(
      "is.workflow.actions.choosefrommenu",
      `<key>UUID</key><string>${IDS.menuCancel}</string>
        <key>GroupingIdentifier</key><string>${GROUPS.confirmMenu}</string>
        <key>WFControlFlowMode</key><integer>1</integer>
        <key>WFMenuItemTitle</key><string>${esc(CANCEL_LABEL)}</string>`,
    ),
  );
  actions.push(
    action(
      "is.workflow.actions.exit",
      `<key>UUID</key><string>${IDS.menuExit}</string>`,
    ),
  );

  actions.push(
    action(
      "is.workflow.actions.choosefrommenu",
      `<key>UUID</key><string>${IDS.menuEnd}</string>
        <key>GroupingIdentifier</key><string>${GROUPS.confirmMenu}</string>
        <key>WFControlFlowMode</key><integer>2</integer>`,
    ),
  );

  // Empty dictate → Ask → POST + exit
  actions.push(
    action(
      "is.workflow.actions.conditional",
      `<key>GroupingIdentifier</key><string>${GROUPS.prefixIf}</string>
        <key>WFControlFlowMode</key><integer>1</integer>`,
    ),
  );
  actions.push(
    action(
      "is.workflow.actions.ask",
      `<key>UUID</key><string>${IDS.askBlank}</string>
        <key>WFAskActionPrompt</key>${plainText("Prefix:")}
        <key>WFInputType</key><string>Text</string>`,
    ),
  );
  actions.push(
    ...sanitizeToPrefix({
      inputAtt: actionOutput(IDS.askBlank, "Provided Input"),
      stripId: IDS.blankStrip,
      setId: IDS.setBlankPrefix,
    }),
  );
  actions.push(
    ...postNotifyExit(functionsUrl, {
      postId: IDS.postBlank,
      noteId: IDS.noteBlank,
      exitId: IDS.exitBlank,
    }),
  );

  actions.push(
    action(
      "is.workflow.actions.conditional",
      `<key>GroupingIdentifier</key><string>${GROUPS.prefixIf}</string>
        <key>WFControlFlowMode</key><integer>2</integer>`,
    ),
  );

  actions.push(
    action(
      "is.workflow.actions.repeat.count",
      `<key>UUID</key><string>${IDS.repeatEnd}</string>
        <key>GroupingIdentifier</key><string>${GROUPS.retryLoop}</string>
        <key>WFControlFlowMode</key><integer>2</integer>`,
    ),
  );

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
