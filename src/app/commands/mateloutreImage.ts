import {
    AttachmentBuilder,
    ChatInputCommandInteraction,
    ColorResolvable,
    EmbedBuilder,
    GuildMember,
    MessageFlags,
    SlashCommandBuilder,
} from "discord.js";
import { SlashCommand } from "../../otterbots/types";
import { otterlogs } from "../../otterbots/utils/otterlogs";
import { MATELOUTRE_IMAGE_CONSTANTS } from "../utils/mateloutreImage/constants";
import { findImageTemplate, imageChoices, textLengthBounds } from "../utils/mateloutreImage/imageTemplates";
import { renderTemplateImage } from "../utils/mateloutreImage/textImage";

// Built at startup from images.json
const choices = imageChoices();
const bounds = textLengthBounds();

export default {
    name: MATELOUTRE_IMAGE_CONSTANTS.COMMAND_NAME,
    autocomplete: false,
    data: new SlashCommandBuilder()
        .setName(MATELOUTRE_IMAGE_CONSTANTS.COMMAND_NAME)
        .setDescription(MATELOUTRE_IMAGE_CONSTANTS.COMMAND_DESCRIPTION)
        .addStringOption(opt =>
            opt.setName(MATELOUTRE_IMAGE_CONSTANTS.OPTION_IMAGE_NAME)
                .setDescription(MATELOUTRE_IMAGE_CONSTANTS.OPTION_IMAGE_DESCRIPTION)
                .setRequired(true)
                .addChoices(...choices)
        )
        .addStringOption(opt =>
            opt.setName(MATELOUTRE_IMAGE_CONSTANTS.OPTION_TEXT_NAME)
                .setDescription(MATELOUTRE_IMAGE_CONSTANTS.OPTION_TEXT_DESCRIPTION)
                .setRequired(true)
                .setMinLength(bounds.min)
                .setMaxLength(bounds.max)
        ) as SlashCommandBuilder,

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const imageId = interaction.options.getString(MATELOUTRE_IMAGE_CONSTANTS.OPTION_IMAGE_NAME, true);
        const text = interaction.options.getString(MATELOUTRE_IMAGE_CONSTANTS.OPTION_TEXT_NAME, true).trim();

        if (choices.length === 0) {
            await interaction.reply({ content: MATELOUTRE_IMAGE_CONSTANTS.MSG_NO_TEMPLATE, flags: MessageFlags.Ephemeral });
            return;
        }

        const template = findImageTemplate(imageId);
        if (!template) {
            await interaction.reply({ content: MATELOUTRE_IMAGE_CONSTANTS.MSG_UNKNOWN_IMAGE, flags: MessageFlags.Ephemeral });
            return;
        }

        // The option only carries the widest limits
        if (text.length < template.minChara) {
            await interaction.reply({
                content: MATELOUTRE_IMAGE_CONSTANTS.MSG_TEXT_TOO_SHORT.replace("{min}", template.minChara.toString()),
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (text.length > template.maxChara) {
            await interaction.reply({
                content: MATELOUTRE_IMAGE_CONSTANTS.MSG_TEXT_TOO_LONG.replace("{max}", template.maxChara.toString()),
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await interaction.deferReply();

        try {
            const imageBuffer = await renderTemplateImage(template, text);
            const attachment = new AttachmentBuilder(imageBuffer, { name: MATELOUTRE_IMAGE_CONSTANTS.RESULT_IMAGE_NAME });

            const displayName = interaction.member instanceof GuildMember
                ? interaction.member.displayName
                : interaction.user.displayName;

            const embed = new EmbedBuilder()
                .setColor((process.env.BOT_COLOR || "#f89800") as ColorResolvable)
                .setAuthor({ name: displayName, iconURL: interaction.user.displayAvatarURL() })
                .setTitle(template.label)
                .setImage(`attachment://${MATELOUTRE_IMAGE_CONSTANTS.RESULT_IMAGE_NAME}`)
                .setFooter({ text: MATELOUTRE_IMAGE_CONSTANTS.EMBED_FOOTER });

            await interaction.editReply({ embeds: [embed], files: [attachment] });
        } catch (error) {
            otterlogs.error(`mateloutre-image: génération impossible pour ${template.id} : ` + error);
            await interaction.editReply({ content: MATELOUTRE_IMAGE_CONSTANTS.MSG_IMAGE_ERROR });
        }
    },
} as SlashCommand;
