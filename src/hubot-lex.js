"use strict";

// Description
//   A hubot script that interacts with AWS Lex.
//
// Configuration:
//   AWS_ACCESS_KEY_ID
//   AWS_SECRET_ACCESS_KEY
//   AWS_DEFAULT_REGION
//   LEX_BOT_NAME - Required. The name of the Lex bot.
//   LEX_BOT_ALIAS - Required. The alias fo the Lex bot.
//   LEX_IGNORE_USER_IDS - Optional. A comman-separated string of HipChat user
//     IDs to ignore.
//   LEX_START_REGEXP - Optional. A RegExp for starting a conversation.2
//
// Commands:
//   hubot LEX_START_REGEXP message - If a LEX_START_REGEXP is not specified,
//     the default /lex/i is used. THe command "hubot lex hello" would send the
//     text "lex hello" to AWS Lex.
//
// Author:
//   Ben Hanzl <ben.hanzl@gmail.com>

const _ = require("lodash");
const safe = require("safe-regex");
const AWS = require('aws-sdk')

module.exports = (robot) => {
  const botAlias = process.env.LEX_BOT_ALIAS;
  const botName = process.env.LEX_BOT_NAME;
  const defaultRegion = process.env.AWS_DEFAULT_REGION;

  AWS.config.update({region: defaultRegion});

  const lexruntime = new AWS.LexRuntime();

  const defaultErrorMessage = "Unable to communicate with AWS Lex.";

  let ignoreUserIds = [];
  if (process.env.LEX_IGNORE_USER_IDS) {
    ignoreUserIds = process.env.LEX_IGNORE_USER_IDS.toLowerCase().split(",");
  }

  let startRegExp = /lex/i;

  const regExp = process.env.LEX_START_REGEXP;
  if (regExp && safe(regExp)) {
    // eslint-disable-next-line security/detect-non-literal-regexp
    startRegExp = new RegExp(regExp, "i");
  } else {
    robot.logger.info("hubot-lex: LEX_START_REGEXP not specified or unsafe.");
  }

  robot.respond(/.+/i, (match) => {
    const userId = match.envelope.user.id;
    if (_.includes(ignoreUserIds, userId.toLowerCase())) {
      robot.logger.info(`hubot-lex: Ignoring user ${userId}`);
      return;
    }

    const conversationKey = `conversation-${match.envelope.room}`;
    const lastConversation = robot.brain.get(conversationKey);

    if (lastConversation) {
      robot.logger.info(`hubot-lex: Responding to last conversation: ${conversationKey} at ${lastConversation}.`);
    } else if (startRegExp.test(match.message.text)) {
      robot.logger.info(`hubot-lex: Responding to ${startRegExp.toString()}.`);
    } else {
      return;
    }

    const message = match.message;
    message.text = message.text.replace(/(@hubot|Hubot:) /i, "").trim();

    var params = {
      botAlias: botAlias,
      botName: botName,
      inputText: message.text,
      userId: userId + 1
    };

    lexruntime.postText(params, function(error, data) {
      if (error) {
        robot.logger.error(`hubot-lex: ${error}\n${error.stack}`);
        match.reply(defaultErrorMessage);
        return;
      }

      if (_.includes(["ConfirmIntent", "ElicitSlot"], data.dialogState)) {
        robot.logger.info(`hubot-lex: Starting conversation for ${conversationKey}`);
        robot.brain.set(conversationKey, Date.now());
      }

      if (_.includes(["ElicitIntent", "Failed", "Fulfilled", "ReadyForFulfillment"], data.dialogState)) {
        robot.logger.info(`hubot-lex: Stoping conversation for ${conversationKey}`);
        robot.brain.set(conversationKey, null);
      }

      if (data.message) {
        robot.logger.info(`hubot-lex: Response from AWS Lex: ${JSON.stringify(data)}`);
        match.reply(data.message);
      }
    });
  });
};
