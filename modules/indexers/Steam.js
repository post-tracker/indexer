const RSS = require( './RSS.js' );
const SteamFeed = require( './SteamFeed' );
const cache = require( '../cache.js' );
const ntfy = require( '../ntfy.js' );

const ATTRIBUTION_WINDOW_SECONDS = 30 * 24 * 60 * 60;

class Steam {
    constructor ( userIdentifier, providerConfig, load ) {
        this.feed = new SteamFeed( userIdentifier, providerConfig, load );
        this.userIdentifier = userIdentifier;
    }

    async loadRecentPosts () {
        try {
            return await this.feed.loadRecentPosts();
        } catch ( feedError ) {
            console.error( feedError );

            return [];
        }
    }

    // Runs once per game after every tracked account has been indexed. The game
    // feed is shared across all of a game's Steam accounts, so attribution is a
    // cross-account question: an announcement author we can't match to ANY
    // tracked persona means there's a studio/dev account we should be tracking
    // (much like finder discovering new accounts).
    static async afterIndex ( serviceConfig, serviceOptions, gameIdentifier, load ) {
        const appId = serviceOptions.allowedSections && serviceOptions.allowedSections[ 0 ];

        if ( !appId ) {
            return;
        }

        const endpoint = `https://steamcommunity.com/games/${ appId }/rss/`;

        let items = false;

        try {
            items = await new RSS( appId, { endpoint }, load ).loadRecentPosts();
        } catch ( feedError ) {
            console.error( feedError );
        }

        if ( !items || items.length === 0 ) {
            return;
        }

        const cutoff = Math.floor( Date.now() / 1000 ) - ATTRIBUTION_WINDOW_SECONDS;
        const recentAuthors = new Set();

        for ( let i = 0; i < items.length; i = i + 1 ) {
            if ( items[ i ].author && ( !items[ i ].timestamp || items[ i ].timestamp >= cutoff ) ) {
                recentAuthors.add( items[ i ].author.trim() );
            }
        }

        if ( recentAuthors.size === 0 ) {
            return;
        }

        const trackedPersonas = new Set();

        await Promise.all( serviceConfig.developers.map( async ( developer ) => {
            const persona = await SteamFeed.resolvePersonaName( developer.identifier, load );

            if ( persona ) {
                trackedPersonas.add( persona.toLowerCase() );
            }
        } ) );

        for ( const author of recentAuthors ) {
            if ( trackedPersonas.has( author.toLowerCase() ) ) {
                continue;
            }

            // Notify only once per (game, author) so the 60s run loop doesn't spam.
            const marker = `steam-unattributed-${ appId }-${ author }`;
            let alreadyNotified = false;

            try {
                alreadyNotified = await cache.get( marker );
            } catch ( cacheError ) {
                console.error( cacheError );
            }

            if ( alreadyNotified ) {
                continue;
            }

            ntfy( {
                message: `"${ author }" posts announcements for ${ gameIdentifier } (app ${ appId }) but matches no tracked account. Consider adding them as a developer/studio account.`,
                title: 'Untracked Steam announcer',
            } );

            try {
                await cache.store( marker, 'notified', true );
            } catch ( storeError ) {
                console.error( storeError );
            }
        }
    }
}

module.exports = Steam;
