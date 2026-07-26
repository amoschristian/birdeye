class ProviderRegistry {
  constructor() {
    this._providers = new Map();
  }

  register(provider) {
    if (this._providers.has(provider.id)) {
      throw new Error(`Provider "${provider.id}" is already registered`);
    }
    this._providers.set(provider.id, provider);
  }

  findByUrl(url) {
    for (const provider of this._providers.values()) {
      if (url.includes(provider.urlPattern)) return provider;
    }
    return null;
  }

  findById(id) {
    return this._providers.get(id) || null;
  }
}

const discordProvider = {
  id: 'discord-work',
  name: 'Discord Work',
  urlPattern: 'discord.com/channels/',
};

const googleChatProvider = {
  id: 'google-chat',
  name: 'Google Chat',
  urlPattern: 'chat.google.com',
};

const whatsappProvider = {
  id: 'whatsapp',
  name: 'WhatsApp',
  urlPattern: 'web.whatsapp.com',
};
