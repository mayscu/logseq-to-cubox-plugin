import "@logseq/libs";
import { BlockEntity, BlockUUIDTuple, SettingSchemaDesc } from "@logseq/libs/dist/LSPlugin.user";
import axios from "axios";
let isDebug = false;

/**
 * main entry
 */
async function main() {
  const logseqSettings = logseq.settings;

  if (!logseqSettings) {
    logseq.UI.showMsg("[Logseq To cubox] Cannot get settings", "error");
    return;
  }

  if (logseqSettings.isDebug === true) {
    isDebug = true;
  }

  if (!logseqSettings.hasOwnProperty("cuboxAPI")) {
    await logseq.updateSettings({
      cuboxAPI: "",
    });
  }

  if (!logseqSettings.hasOwnProperty("logseqTag")) {
    await logseq.updateSettings({
      logseqTag: "",
    });
  }

  if (!logseqSettings.hasOwnProperty("cuboxTag")) {
    await logseq.updateSettings({
      cuboxTag: "",
    });
  }

  applySettingsSchema();

  if (!logseqSettings.cuboxAPI) {
    logseq.UI.showMsg("[Logseq To cubox] You should change plugin settings");
    return;
  }

  logseq.Editor.registerSlashCommand(
    'cubox',
    async () => {
      const currentBlock = await logseq.Editor.getCurrentBlock();
      if (currentBlock != null) {
        const contentWithChild = await logseq.Editor.getBlock(currentBlock.uuid, { includeChildren: true });
        if (contentWithChild != null) {
          const content = await getTreeContent(contentWithChild);
          await postTocubox(content, logseqSettings.cuboxAPI, logseqSettings.cuboxTag);
          if (logseqSettings.logseqTag) {
            await logseq.Editor.insertAtEditingCursor(logseqSettings.logseqTag);
          }
        }
      }
    },
  )

  logseq.Editor.registerBlockContextMenuItem("Logseq To cubox", async (e) => {
    const contentWithChild = await logseq.Editor.getBlock(e.uuid, { includeChildren: true })
    if (contentWithChild != null) {
      const content = await getTreeContent(contentWithChild);
      await postTocubox(content, logseqSettings.cuboxAPI, logseqSettings.cuboxTag);
      // if (logseqSettings.logseqTag) {
      //   await logseq.Editor.insertBlock(e.uuid, logseqSettings.logseqTag);
      // }
    }
  });

}

function applySettingsSchema() {
  const settings: SettingSchemaDesc[] = [
    {
      key: "cuboxAPI",
      description: "get the api follow the direction given in https://help.cubox.pro/save/89d3/",
      type: "string",
      default: "",
      title: "cubox API",
    },
    {
      key: "logseqTag",
      description:
        "Add to the current text cursor of Logseq.",
      type: "string",
      default: " #cubox ",
      title: "Logseq Tag",
    },
    {
      key: "cuboxTag",
      description:
        "Add to the end of the text sent to cubox.",
      type: "string",
      default: "",
      title: "cubox Tag",
    }
  ];
  logseq.useSettingsSchema(settings);
}

function isBlockEntity(b: BlockEntity | BlockUUIDTuple): b is BlockEntity {
  return (b as BlockEntity).uuid !== undefined;
}

async function formatContent(content: string) {
  let text = content.replaceAll(/:LOGBOOK:|collapsed:: true/gi, "");
  if (text.includes("CLOCK: [")) {
    text = text.substring(0, text.indexOf("CLOCK: ["));
  }

  // Hide Page Properties
  text = text.replaceAll(/((?<=::).*|.*::)/g, "");

  // Hide Brackets
  text = text.replaceAll("[[", "");
  text = text.replaceAll("]]", "");

  // Hide inblod
  text = text.replaceAll("**", "");

  const rxGetId = /\(\(([^)]*)\)\)/;
  const blockId = rxGetId.exec(text);
  if (blockId != null) {
    const block = await logseq.Editor.getBlock(blockId[1], {
      includeChildren: true,
    });
    //optional based on setting enabled

    if (block != null) {
      text = text.replace(
        `((${blockId[1]}))`,
        block.content.substring(0, block.content.indexOf("id::"))
      );
    }
  }

  if (text.indexOf(`id:: `) === -1) {
    return text;
  } else {
    return text.substring(0, text.indexOf(`id:: `));
  }
}


async function getTreeContent(b: BlockEntity) {
  let content = "";
  const trimmedBlockContent = await formatContent(b.content.trim());
  if (trimmedBlockContent.length > 0) {
    content += trimmedBlockContent;
    if (!content.endsWith("\n")) {
      content += "\n";
    }
  }

  if (!b.children) {
    return content;
  }

  for (const child of b.children) {
    if (isBlockEntity(child)) {
      content += await getTreeContent(child);
    } else {
      const childBlock = await logseq.Editor.getBlock(child[1], {
        includeChildren: true,
      });
      if (childBlock) {
        content += await getTreeContent(childBlock);
      }
    }
  }
  return content;
}

async function postTocubox(content: string, cuboxAPI: string, cuboxTag: string | undefined) {
  
  if (cuboxTag) {
    content += cuboxTag;
  }
  
  axios.post(cuboxAPI, {  "type": "memo","content": content })
    .then(response => response.data)
    .then(data => {
      logseq.UI.showMsg(data.message);
    })
    .catch(error => logseq.UI.showMsg('Error'));
}


// bootstrap
logseq.ready(main).catch(console.error);