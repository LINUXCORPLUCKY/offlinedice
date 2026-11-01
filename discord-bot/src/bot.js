const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('./database');

function createDiscordBot(token, clientId, guildId, ownerUserIds = [], adminRoleIds = []) {
  if (!token) {
    console.warn('[DISCORD BOT] No DISCORD_TOKEN provided. Bot is inactive (API server running standalone).');
    return null;
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
  });

  // Check Admin Authority
  function isAuthorized(interaction) {
    if (ownerUserIds.includes(interaction.user.id)) return true;
    if (interaction.member && interaction.member.roles) {
      for (const roleId of adminRoleIds) {
        if (interaction.member.roles.cache.has(roleId)) return true;
      }
    }
    return false;
  }

  function durationToTimestamp(duration) {
    const now = Date.now();
    switch (duration) {
      case '24hours': return now + 24 * 60 * 60 * 1000;
      case '7days': return now + 7 * 24 * 60 * 60 * 1000;
      case '30days': return now + 30 * 24 * 60 * 60 * 1000;
      case '60days': return now + 60 * 24 * 60 * 60 * 1000;
      case 'lifetime':
      default: return null;
    }
  }

  function generateRandomKey(prefix = 'HD-USER') {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const seg = (len) => {
      let s = '';
      for (let i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
      return s;
    };
    return `${prefix}-${seg(4)}-${seg(4)}-${seg(4)}`;
  }

  // Define Slash Commands
  const commands = [
    // 1. /genkey
    new SlashCommandBuilder()
      .setName('genkey')
      .setDescription('Generate a new Headless Dice license key')
      .addStringOption(opt =>
        opt.setName('role')
          .setDescription('License Tier')
          .setRequired(true)
          .addChoices(
            { name: 'Standard User (USER)', value: 'USER' },
            { name: 'VIP Member (VIP)', value: 'VIP' },
            { name: 'Administrator (ADMIN)', value: 'ADMIN' },
            { name: 'Owner Authority (OWNER)', value: 'OWNER' }
          ))
      .addStringOption(opt =>
        opt.setName('duration')
          .setDescription('License Validity Duration')
          .setRequired(true)
          .addChoices(
            { name: '24 Hours (1 Day)', value: '24hours' },
            { name: '7 Days (1 Week)', value: '7days' },
            { name: '30 Days (1 Month)', value: '30days' },
            { name: '60 Days (2 Months)', value: '60days' },
            { name: 'Lifetime Access', value: 'lifetime' }
          ))
      .addStringOption(opt => opt.setName('note').setDescription('User name or Discord tag / note'))
      .addBooleanOption(opt => opt.setName('hwid_lock').setDescription('Lock to first device hardware ID (default: True)')),

    // 2. /listkeys
    new SlashCommandBuilder()
      .setName('listkeys')
      .setDescription('List all license keys stored in VPS database')
      .addStringOption(opt =>
        opt.setName('status')
          .setDescription('Filter by status')
          .addChoices(
            { name: 'Active Only', value: 'ACTIVE' },
            { name: 'Revoked Only', value: 'REVOKED' },
            { name: 'All Keys', value: 'ALL' }
          )),

    // 3. /keyinfo
    new SlashCommandBuilder()
      .setName('keyinfo')
      .setDescription('Look up full details on a specific license key')
      .addStringOption(opt => opt.setName('key').setDescription('License key string').setRequired(true)),

    // 4. /resethwid
    new SlashCommandBuilder()
      .setName('resethwid')
      .setDescription('Reset HWID hardware binding for a user who switched devices')
      .addStringOption(opt => opt.setName('key').setDescription('License key to unlock').setRequired(true)),

    // 5. /revokekey
    new SlashCommandBuilder()
      .setName('revokekey')
      .setDescription('Revoke a license key immediately')
      .addStringOption(opt => opt.setName('key').setDescription('License key to revoke').setRequired(true)),

    // 6. /deletekey
    new SlashCommandBuilder()
      .setName('deletekey')
      .setDescription('Permanently delete a license key from the database')
      .addStringOption(opt => opt.setName('key').setDescription('License key to delete').setRequired(true)),

    // 7. /stats
    new SlashCommandBuilder()
      .setName('stats')
      .setDescription('View live platform statistics and active licenses'),

    // 8. /maintenance
    new SlashCommandBuilder()
      .setName('maintenance')
      .setDescription('Toggle website emergency maintenance mode on/off')
      .addBooleanOption(opt => opt.setName('enable').setDescription('True to turn ON maintenance, False to turn OFF').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Notice reason to display on site')),

    // 9. /broadcast
    new SlashCommandBuilder()
      .setName('broadcast')
      .setDescription('Post or clear live announcement banner on website')
      .addStringOption(opt => opt.setName('message').setDescription('Banner text (leave empty to clear)'))
      .addStringOption(opt =>
        opt.setName('type')
          .setDescription('Banner style type')
          .addChoices(
            { name: 'Warning (Orange)', value: 'warning' },
            { name: 'Urgent (Red)', value: 'danger' },
            { name: 'Success (Green)', value: 'success' },
            { name: 'Information (Cyan)', value: 'info' }
          )),

    // 10. /forcerefresh
    new SlashCommandBuilder()
      .setName('forcerefresh')
      .setDescription('Broadcast instant force refresh to all connected web clients')
  ];

  client.once('ready', async () => {
    console.log(`[DISCORD BOT] Logged in as ${client.user.tag}! Registering slash commands...`);
    const rest = new REST({ version: '10' }).setToken(token);
    try {
      if (guildId) {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
        console.log(`[DISCORD BOT] Registered ${commands.length} guild slash commands!`);
      } else {
        await rest.put(Routes.applicationCommands(clientId), { body: commands });
        console.log(`[DISCORD BOT] Registered ${commands.length} global slash commands!`);
      }
    } catch(err) {
      console.error('[DISCORD BOT] Failed to register commands:', err.message);
    }
  });

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (!isAuthorized(interaction)) {
      return interaction.reply({
        content: '⛔ **Access Denied**: You do not have permission to execute Headless Dice owner commands.',
        ephemeral: true
      });
    }

    const { commandName } = interaction;

    // 1. /genkey
    if (commandName === 'genkey') {
      const role = interaction.options.getString('role');
      const duration = interaction.options.getString('duration');
      const note = interaction.options.getString('note') || '';
      const hwidLock = interaction.options.getBoolean('hwid_lock') !== false;

      const prefix = role === 'OWNER' ? 'HD-OWNER' : role === 'ADMIN' ? 'HD-ADMIN' : role === 'VIP' ? 'HD-VIP' : 'HD-USER';
      const key = generateRandomKey(prefix);
      const expire = durationToTimestamp(duration);

      const payload = {
        role: role,
        duration: duration,
        boundHwid: hwidLock ? 'Unbound' : 'Disabled',
        createdTimestamp: Date.now(),
        expireTimestamp: expire,
        status: 'ACTIVE',
        notes: note || undefined
      };

      db.setKey(key, payload);

      const embed = new EmbedBuilder()
        .setTitle('⚡ LICENSE KEY GENERATED')
        .setColor(0xa855f7)
        .addFields(
          { name: '🔑 Key', value: `\`\`\`${key}\`\`\``, inline: false },
          { name: '🎖️ Role', value: `**${role}**`, inline: true },
          { name: '⏱️ Duration', value: `**${duration}**`, inline: true },
          { name: '🔒 HWID Lock', value: hwidLock ? '`Unbound (Locks on first login)`' : '`Disabled`', inline: true },
          { name: '📝 Note', value: note ? `\`${note}\`` : '*None*', inline: false }
        )
        .setFooter({ text: 'Headless Dice VPS Database • Secure Key Management' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // 2. /listkeys
    if (commandName === 'listkeys') {
      const statusFilter = interaction.options.getString('status') || 'ALL';
      const allKeys = db.getAllKeys();
      const list = Object.entries(allKeys).filter(([_, v]) => {
        if (statusFilter === 'ALL') return true;
        return v.status === statusFilter;
      });

      const total = list.length;
      const preview = list.slice(0, 15).map(([k, v]) => {
        const hwidStatus = v.boundHwid === 'Unbound' ? '🟡 Unbound' : (v.boundHwid || 'None');
        const roleBadge = `[${v.role || 'USER'}]`;
        const noteText = v.notes ? `(${v.notes})` : '';
        return `• \`${k}\` ${roleBadge} — ${hwidStatus} ${noteText}`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setTitle(`📋 LICENSE KEYS VAULT (${total} Total)`)
        .setColor(0x3b82f6)
        .setDescription(preview || '*No keys found matching criteria.*')
        .setFooter({ text: total > 15 ? `Showing first 15 of ${total} keys` : `Total: ${total} keys` });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // 3. /keyinfo
    if (commandName === 'keyinfo') {
      const key = (interaction.options.getString('key') || '').trim();
      const data = db.getKey(key);

      if (!data) {
        return interaction.reply({ content: `❌ Key \`${key}\` not found in database.`, ephemeral: true });
      }

      const created = data.createdTimestamp ? new Date(data.createdTimestamp).toLocaleString() : 'Unknown';
      const expire = data.expireTimestamp ? new Date(data.expireTimestamp).toLocaleString() : 'Never (Lifetime)';

      const embed = new EmbedBuilder()
        .setTitle(`🔍 KEY INFO: ${key}`)
        .setColor(data.status === 'ACTIVE' ? 0x22c55e : 0xef4444)
        .addFields(
          { name: 'Status', value: `**${data.status}**`, inline: true },
          { name: 'Role', value: `**${data.role || 'USER'}**`, inline: true },
          { name: 'Duration', value: `**${data.duration || 'N/A'}**`, inline: true },
          { name: 'Bound HWID', value: `\`${data.boundHwid || 'Unbound'}\``, inline: false },
          { name: 'Created', value: created, inline: true },
          { name: 'Expires', value: expire, inline: true },
          { name: 'Note', value: data.notes || '*None*', inline: false }
        );

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // 4. /resethwid
    if (commandName === 'resethwid') {
      const key = (interaction.options.getString('key') || '').trim();
      const data = db.getKey(key);

      if (!data) {
        return interaction.reply({ content: `❌ Key \`${key}\` not found.`, ephemeral: true });
      }

      db.updateKey(key, { boundHwid: 'Unbound' });
      return interaction.reply({
        content: `✅ Successfully reset HWID for \`${key}\`! The user can now log in from their new device.`,
        ephemeral: false
      });
    }

    // 5. /revokekey
    if (commandName === 'revokekey') {
      const key = (interaction.options.getString('key') || '').trim();
      const data = db.getKey(key);

      if (!data) {
        return interaction.reply({ content: `❌ Key \`${key}\` not found.`, ephemeral: true });
      }

      db.updateKey(key, { status: 'REVOKED' });
      return interaction.reply({
        content: `🚫 Key \`${key}\` has been **REVOKED**. Access blocked immediately.`,
        ephemeral: false
      });
    }

    // 6. /deletekey
    if (commandName === 'deletekey') {
      const key = (interaction.options.getString('key') || '').trim();
      const success = db.deleteKey(key);

      if (!success) {
        return interaction.reply({ content: `❌ Key \`${key}\` not found.`, ephemeral: true });
      }

      return interaction.reply({
        content: `🗑️ Key \`${key}\` permanently deleted from database.`,
        ephemeral: true
      });
    }

    // 7. /stats
    if (commandName === 'stats') {
      const allKeys = Object.values(db.getAllKeys());
      const activeCount = allKeys.filter(k => k && k.status === 'ACTIVE').length;
      const revokedCount = allKeys.filter(k => k && k.status === 'REVOKED').length;
      const stats = db.getStats();

      const embed = new EmbedBuilder()
        .setTitle('📊 HEADLESS DICE VPS PLATFORM TELEMETRY')
        .setColor(0xff7700)
        .addFields(
          { name: '🔑 Total Keys', value: `**${allKeys.length}**`, inline: true },
          { name: '🟢 Active Keys', value: `**${activeCount}**`, inline: true },
          { name: '🔴 Revoked Keys', value: `**${revokedCount}**`, inline: true },
          { name: '🌐 Total Visits', value: `**${stats.totalVisits || 0}**`, inline: true },
          { name: '👥 Active Sessions (15m)', value: `**${Object.keys(stats.activeUsers || {}).length}**`, inline: true },
          { name: '🛡️ Database Mode', value: '`VPS Local JSON (No Firebase)`', inline: true }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // 8. /maintenance
    if (commandName === 'maintenance') {
      const enable = interaction.options.getBoolean('enable');
      const reason = interaction.options.getString('reason') || (enable ? 'Emergency Maintenance Mode' : '');

      const m = db.setMaintenance({
        enabled: enable,
        reason: reason,
        author: interaction.user.tag
      });

      return interaction.reply({
        content: enable
          ? `🛑 **MAINTENANCE ACTIVATED**: Website is now locked down. Reason: *${reason}*`
          : `🟢 **MAINTENANCE DEACTIVATED**: Website is now live!`
      });
    }

    // 9. /broadcast
    if (commandName === 'broadcast') {
      const message = interaction.options.getString('message');
      const type = interaction.options.getString('type') || 'warning';

      const a = db.setAnnouncement({
        active: !!message,
        text: message || '',
        type: type,
        author: interaction.user.tag
      });

      return interaction.reply({
        content: message
          ? `📢 **ANNOUNCEMENT BROADCASTED**: "${message}"`
          : `🧹 Active announcement cleared.`
      });
    }

    // 10. /forcerefresh
    if (commandName === 'forcerefresh') {
      db.setControl({
        reason: `Discord Triggered by ${interaction.user.tag}`,
        author: interaction.user.tag
      });

      return interaction.reply({
        content: '⚡ **FORCE REFRESH BROADCASTED**: All open client browser tabs have been instructed to reload!'
      });
    }
  });

  client.login(token).catch(err => {
    console.error('[DISCORD BOT ERROR] Login failed:', err.message);
  });

  return client;
}

module.exports = createDiscordBot;

