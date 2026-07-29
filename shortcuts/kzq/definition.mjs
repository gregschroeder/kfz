/**
 * KZQ — Kennzeichen Queue
 * Apple Shortcut (Watch-first; also iPhone / iPad / Mac).
 *
 * Flow:
 *   1. Dictate Text (stops after short pause)
 *   2. Parse spoken tokens → Prefix (commands, then letters max 3)
 *   3. Ask for Input with Prefix as default (visual confirm / edit)
 *   4. Re-sanitize field → POST kfz-capture
 *
 * Import question fills the API key Text action — no secret in git.
 * Parser algorithm: parse-spoken-prefix.mjs (keep in sync).
 *
 * Keep attachments UUID-only (no OutputName) — German iOS localizes magic names.
 */

const OBJ = "\uFFFC";

/** Valid hex UUIDs only. */
export const IDS = {
  apiKeyText: "A1000001-0000-4000-8000-000000000001",
  dictate: "A1000002-0000-4000-8000-000000000002",
  emptyPrefix: "A1000003-0000-4000-8000-000000000003",
  setPrefixEmpty: "A1000004-0000-4000-8000-000000000004",
  split: "A1000005-0000-4000-8000-000000000005",
  forEachStart: "A1000006-0000-4000-8000-000000000006",
  tokenLower: "A1000007-0000-4000-8000-000000000007",
  tokenStrip: "A1000007-0000-4000-8000-000000000027",
  setToken: "A1000008-0000-4000-8000-000000000008",
  popReplace: "A1000009-0000-4000-8000-000000000009",
  setPrefixPop: "A100000A-0000-4000-8000-00000000000A",
  clearEmpty: "A100000B-0000-4000-8000-00000000000B",
  setPrefixClear: "A100000C-0000-4000-8000-00000000000C",
  stripLetters: "A100000D-0000-4000-8000-00000000000D",
  upperLetters: "A100000E-0000-4000-8000-00000000000E",
  combineAppend: "A100000F-0000-4000-8000-00000000000F",
  truncate: "A1000010-0000-4000-8000-000000000010",
  setPrefixAppend: "A1000011-0000-4000-8000-000000000011",
  forEachEnd: "A1000012-0000-4000-8000-000000000012",
  askConfirm: "A1000013-0000-4000-8000-000000000013",
  sanitizeStrip: "A1000014-0000-4000-8000-000000000014",
  sanitizeUpper: "A1000015-0000-4000-8000-000000000015",
  sanitizeTrunc: "A1000016-0000-4000-8000-000000000016",
  setPrefixFinal: "A1000017-0000-4000-8000-000000000017",
  post: "A1000018-0000-4000-8000-000000000018",
  resultNote: "A1000019-0000-4000-8000-000000000019",
  emptyNote: "A100001A-0000-4000-8000-00000000001A",
};

const GROUPS = {
  forEach: "B1000001-0000-4000-8000-000000000001",
  tokenIf: "B1000002-0000-4000-8000-000000000002",
  prefixIf: "B1000003-0000-4000-8000-000000000003",
};

const DEFAULT_FUNCTIONS_URL =
  "https://wchzccrcqlxgsftjbpgn.supabase.co/functions/v1/kfz-capture";

const LETTER_STRIP = "[^a-zA-ZäöüÄÖÜ]";
const TRUNCATE_3 = "^(.{0,3}).*$";
const POP_LAST = ".$";

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

/** WFInput wrapper required by modern conditionals. */
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

function stringEqualsTemplate(variableName, value) {
  return `<dict>
                        <key>WFCondition</key>
                        <integer>4</integer>
                        <key>WFConditionalActionString</key>
                        <string>${esc(value)}</string>
                        <key>WFInput</key>
                        ${conditionInputFromVariable(variableName)}
                      </dict>`;
}

/** Any-of string equals (OR). */
function anyOfEquals(variableName, values) {
  return `<dict>
          <key>Value</key>
          <dict>
            <key>WFActionParameterFilterPrefix</key>
            <integer>0</integer>
            <key>WFActionParameterFilterTemplates</key>
            <array>
              ${values.map((v) => stringEqualsTemplate(variableName, v)).join("\n              ")}
            </array>
          </dict>
          <key>WFSerializationType</key>
          <string>WFContentPredicateTableTemplate</string>
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

/**
 * @param {{ functionsUrl?: string }} [opts]
 * @returns {string} XML plist
 */
export function buildShortcutPlist(opts = {}) {
  const functionsUrl = opts.functionsUrl ?? DEFAULT_FUNCTIONS_URL;
  const actions = [];

  // 0 — Household key (import question)
  actions.push(
    action(
      "is.workflow.actions.gettext",
      `<key>UUID</key>
        <string>${IDS.apiKeyText}</string>
        <key>WFTextActionText</key>
        <string></string>`,
    ),
  );

  // 1 — Dictate (auto-stop after short pause)
  actions.push(
    action(
      "is.workflow.actions.dictatetext",
      `<key>UUID</key>
        <string>${IDS.dictate}</string>
        <key>WFDictateTextStopListening</key>
        <string>After Short Pause</string>
        <key>WFSpeechLanguage</key>
        <string>de-DE</string>`,
    ),
  );

  // 2 — Prefix = ""
  actions.push(
    action(
      "is.workflow.actions.gettext",
      `<key>UUID</key>
        <string>${IDS.emptyPrefix}</string>
        <key>WFTextActionText</key>
        <string></string>`,
    ),
  );
  actions.push(
    action(
      "is.workflow.actions.setvariable",
      `<key>UUID</key>
        <string>${IDS.setPrefixEmpty}</string>
        <key>WFVariableName</key>
        <string>Prefix</string>
        <key>WFInput</key>
        ${attachmentOnly(actionOutput(IDS.emptyPrefix))}`,
    ),
  );

  // 3 — Split dictated text on spaces
  actions.push(
    action(
      "is.workflow.actions.text.split",
      `<key>UUID</key>
        <string>${IDS.split}</string>
        <key>WFTextSeparator</key>
        <string>Spaces</string>
        <key>WFInput</key>
        ${attachmentOnly(actionOutput(IDS.dictate))}`,
    ),
  );

  // 4 — Repeat with Each token
  actions.push(
    action(
      "is.workflow.actions.repeat.each",
      `<key>UUID</key>
        <string>${IDS.forEachStart}</string>
        <key>GroupingIdentifier</key>
        <string>${GROUPS.forEach}</string>
        <key>WFControlFlowMode</key>
        <integer>0</integer>
        <key>WFInput</key>
        ${attachmentOnly(actionOutput(IDS.split))}`,
    ),
  );

  // 4a — Token = lowercase letters-only (commands; strips dictation punctuation)
  actions.push(
    action(
      "is.workflow.actions.text.changecase",
      `<key>UUID</key>
        <string>${IDS.tokenLower}</string>
        <key>WFCaseType</key>
        <string>lowercase</string>
        <key>WFInput</key>
        ${attachmentOnly(actionOutput(IDS.forEachStart))}`,
    ),
  );
  actions.push(
    action(
      "is.workflow.actions.text.replace",
      `<key>UUID</key>
        <string>${IDS.tokenStrip}</string>
        <key>WFReplaceTextFind</key>
        <string>[^a-z]</string>
        <key>WFReplaceTextReplace</key>
        <string></string>
        <key>WFReplaceTextCaseSensitive</key>
        <false/>
        <key>WFReplaceTextRegularExpression</key>
        <true/>
        <key>WFInput</key>
        ${attachmentOnly(actionOutput(IDS.tokenLower))}`,
    ),
  );
  actions.push(
    action(
      "is.workflow.actions.setvariable",
      `<key>UUID</key>
        <string>${IDS.setToken}</string>
        <key>WFVariableName</key>
        <string>Token</string>
        <key>WFInput</key>
        ${attachmentOnly(actionOutput(IDS.tokenStrip))}`,
    ),
  );

  // 4b — If Token is backspace|delete → pop last char
  actions.push(
    action(
      "is.workflow.actions.conditional",
      `<key>GroupingIdentifier</key>
        <string>${GROUPS.tokenIf}</string>
        <key>WFControlFlowMode</key>
        <integer>0</integer>
        <key>WFConditions</key>
        ${anyOfEquals("Token", ["backspace", "delete"])}`,
    ),
  );
  actions.push(
    action(
      "is.workflow.actions.text.replace",
      `<key>UUID</key>
        <string>${IDS.popReplace}</string>
        <key>WFReplaceTextFind</key>
        <string>${esc(POP_LAST)}</string>
        <key>WFReplaceTextReplace</key>
        <string></string>
        <key>WFReplaceTextCaseSensitive</key>
        <true/>
        <key>WFReplaceTextRegularExpression</key>
        <true/>
        <key>WFInput</key>
        ${attachmentOnly(variableRef("Prefix"))}`,
    ),
  );
  actions.push(
    action(
      "is.workflow.actions.setvariable",
      `<key>UUID</key>
        <string>${IDS.setPrefixPop}</string>
        <key>WFVariableName</key>
        <string>Prefix</string>
        <key>WFInput</key>
        ${attachmentOnly(actionOutput(IDS.popReplace))}`,
    ),
  );

  // 4c — Otherwise If Token is clear|erase|reset → clear
  actions.push(
    action(
      "is.workflow.actions.conditional",
      `<key>GroupingIdentifier</key>
        <string>${GROUPS.tokenIf}</string>
        <key>WFControlFlowMode</key>
        <integer>1</integer>
        <key>WFConditions</key>
        ${anyOfEquals("Token", ["clear", "erase", "reset"])}`,
    ),
  );
  actions.push(
    action(
      "is.workflow.actions.gettext",
      `<key>UUID</key>
        <string>${IDS.clearEmpty}</string>
        <key>WFTextActionText</key>
        <string></string>`,
    ),
  );
  actions.push(
    action(
      "is.workflow.actions.setvariable",
      `<key>UUID</key>
        <string>${IDS.setPrefixClear}</string>
        <key>WFVariableName</key>
        <string>Prefix</string>
        <key>WFInput</key>
        ${attachmentOnly(actionOutput(IDS.clearEmpty))}`,
    ),
  );

  // 4d — Otherwise → append letters, cap 3
  actions.push(
    action(
      "is.workflow.actions.conditional",
      `<key>GroupingIdentifier</key>
        <string>${GROUPS.tokenIf}</string>
        <key>WFControlFlowMode</key>
        <integer>1</integer>`,
    ),
  );
  actions.push(
    action(
      "is.workflow.actions.text.replace",
      `<key>UUID</key>
        <string>${IDS.stripLetters}</string>
        <key>WFReplaceTextFind</key>
        <string>${esc(LETTER_STRIP)}</string>
        <key>WFReplaceTextReplace</key>
        <string></string>
        <key>WFReplaceTextCaseSensitive</key>
        <false/>
        <key>WFReplaceTextRegularExpression</key>
        <true/>
        <key>WFInput</key>
        ${attachmentOnly(actionOutput(IDS.forEachStart))}`,
    ),
  );
  actions.push(
    action(
      "is.workflow.actions.text.changecase",
      `<key>UUID</key>
        <string>${IDS.upperLetters}</string>
        <key>WFCaseType</key>
        <string>UPPERCASE</string>
        <key>WFInput</key>
        ${attachmentOnly(actionOutput(IDS.stripLetters))}`,
    ),
  );
  actions.push(
    action(
      "is.workflow.actions.gettext",
      `<key>UUID</key>
        <string>${IDS.combineAppend}</string>
        <key>WFTextActionText</key>
        ${textToken(`${OBJ}${OBJ}`, {
          "{0, 1}": variableRef("Prefix"),
          "{1, 1}": actionOutput(IDS.upperLetters),
        })}`,
    ),
  );
  actions.push(
    action(
      "is.workflow.actions.text.replace",
      `<key>UUID</key>
        <string>${IDS.truncate}</string>
        <key>WFReplaceTextFind</key>
        <string>${esc(TRUNCATE_3)}</string>
        <key>WFReplaceTextReplace</key>
        <string>$1</string>
        <key>WFReplaceTextCaseSensitive</key>
        <true/>
        <key>WFReplaceTextRegularExpression</key>
        <true/>
        <key>WFInput</key>
        ${attachmentOnly(actionOutput(IDS.combineAppend))}`,
    ),
  );
  actions.push(
    action(
      "is.workflow.actions.setvariable",
      `<key>UUID</key>
        <string>${IDS.setPrefixAppend}</string>
        <key>WFVariableName</key>
        <string>Prefix</string>
        <key>WFInput</key>
        ${attachmentOnly(actionOutput(IDS.truncate))}`,
    ),
  );

  // End If + End Repeat
  actions.push(
    action(
      "is.workflow.actions.conditional",
      `<key>GroupingIdentifier</key>
        <string>${GROUPS.tokenIf}</string>
        <key>WFControlFlowMode</key>
        <integer>2</integer>`,
    ),
  );
  actions.push(
    action(
      "is.workflow.actions.repeat.each",
      `<key>UUID</key>
        <string>${IDS.forEachEnd}</string>
        <key>GroupingIdentifier</key>
        <string>${GROUPS.forEach}</string>
        <key>WFControlFlowMode</key>
        <integer>2</integer>`,
    ),
  );

  // 5 — Confirm / edit field (no autosubmit)
  actions.push(
    action(
      "is.workflow.actions.ask",
      `<key>UUID</key>
        <string>${IDS.askConfirm}</string>
        <key>WFAskActionPrompt</key>
        <string>KZQ</string>
        <key>WFAskActionDefaultAnswer</key>
        ${attachVariable("Prefix")}
        <key>WFInputType</key>
        <string>Text</string>`,
    ),
  );

  // 6 — Sanitize confirmed field → Prefix
  actions.push(
    action(
      "is.workflow.actions.text.replace",
      `<key>UUID</key>
        <string>${IDS.sanitizeStrip}</string>
        <key>WFReplaceTextFind</key>
        <string>${esc(LETTER_STRIP)}</string>
        <key>WFReplaceTextReplace</key>
        <string></string>
        <key>WFReplaceTextCaseSensitive</key>
        <false/>
        <key>WFReplaceTextRegularExpression</key>
        <true/>
        <key>WFInput</key>
        ${attachmentOnly(actionOutput(IDS.askConfirm))}`,
    ),
  );
  actions.push(
    action(
      "is.workflow.actions.text.changecase",
      `<key>UUID</key>
        <string>${IDS.sanitizeUpper}</string>
        <key>WFCaseType</key>
        <string>UPPERCASE</string>
        <key>WFInput</key>
        ${attachmentOnly(actionOutput(IDS.sanitizeStrip))}`,
    ),
  );
  actions.push(
    action(
      "is.workflow.actions.text.replace",
      `<key>UUID</key>
        <string>${IDS.sanitizeTrunc}</string>
        <key>WFReplaceTextFind</key>
        <string>${esc(TRUNCATE_3)}</string>
        <key>WFReplaceTextReplace</key>
        <string>$1</string>
        <key>WFReplaceTextCaseSensitive</key>
        <true/>
        <key>WFReplaceTextRegularExpression</key>
        <true/>
        <key>WFInput</key>
        ${attachmentOnly(actionOutput(IDS.sanitizeUpper))}`,
    ),
  );
  actions.push(
    action(
      "is.workflow.actions.setvariable",
      `<key>UUID</key>
        <string>${IDS.setPrefixFinal}</string>
        <key>WFVariableName</key>
        <string>Prefix</string>
        <key>WFInput</key>
        ${attachmentOnly(actionOutput(IDS.sanitizeTrunc))}`,
    ),
  );

  // 7 — If Prefix has value → POST + notify; else empty notice
  actions.push(
    action(
      "is.workflow.actions.conditional",
      `<key>GroupingIdentifier</key>
        <string>${GROUPS.prefixIf}</string>
        <key>WFControlFlowMode</key>
        <integer>0</integer>
        <key>WFCondition</key>
        <integer>100</integer>
        <key>WFInput</key>
        ${conditionInputFromVariable("Prefix")}`,
    ),
  );

  const headers = dictField(`
              ${dictStringItem("Content-Type", plainText("application/json"))}
              ${dictStringItem("x-kfz-key", attachOutput(IDS.apiKeyText))}
            `);
  const jsonBody = dictField(`
              ${dictStringItem("prefix", attachVariable("Prefix"))}
              ${dictStringItem("source", plainText("watch"))}
            `);

  actions.push(
    action(
      "is.workflow.actions.downloadurl",
      `<key>UUID</key>
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
        ${jsonBody}`,
    ),
  );

  actions.push(
    action(
      "is.workflow.actions.notification",
      `<key>UUID</key>
        <string>${IDS.resultNote}</string>
        <key>WFNotificationActionTitle</key>
        <string>KZQ</string>
        <key>WFNotificationActionBody</key>
        ${textToken(`Queued ${OBJ}`, {
          "{7, 1}": variableRef("Prefix"),
        })}`,
    ),
  );

  actions.push(
    action(
      "is.workflow.actions.conditional",
      `<key>GroupingIdentifier</key>
        <string>${GROUPS.prefixIf}</string>
        <key>WFControlFlowMode</key>
        <integer>1</integer>`,
    ),
  );
  actions.push(
    action(
      "is.workflow.actions.notification",
      `<key>UUID</key>
        <string>${IDS.emptyNote}</string>
        <key>WFNotificationActionTitle</key>
        <string>KZQ</string>
        <key>WFNotificationActionBody</key>
        <string>Empty prefix</string>`,
    ),
  );
  actions.push(
    action(
      "is.workflow.actions.conditional",
      `<key>GroupingIdentifier</key>
        <string>${GROUPS.prefixIf}</string>
        <key>WFControlFlowMode</key>
        <integer>2</integer>`,
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
