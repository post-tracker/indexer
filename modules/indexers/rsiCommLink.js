const cheerio = require( 'cheerio' );

const Post = require( '../Post.js' );

class RSICommLink {
    constructor ( userId, indexerConfig, load ) {
        this.urlBase = 'https://robertsspaceindustries.com';
        this.commlinkItemsUrl = 'https://robertsspaceindustries.com/api/hub/getCommlinkItems';

        this.userId = userId;
        this.load = load;
    }

    getISOStringFromTimeAgo(timeAgoStr) {

        const secondsAgoMatches = timeAgoStr.match(/^(\d+) (seconds? ago)/);
        const minutesAgoMatches = timeAgoStr.match(/^(\d+) (minutes? ago)/);
        const hoursAgoMatches = timeAgoStr.match(/^(\d+) (hours? ago)/);
        const daysAgoMatches = timeAgoStr.match(/^(\d+) (days? ago)/);
        const weeksAgoMatches = timeAgoStr.match(/^(\d+) (weeks? ago)/);
        const monthsAgoMatches = timeAgoStr.match(/^(\d+) (months? ago)/);
        const yearsAgoMatches = timeAgoStr.match(/^(\d+) (years? ago)/);

        let t = new Date();

        if (secondsAgoMatches) {
            t.setSeconds(t.getSeconds() - secondsAgoMatches[1]);
        }
        if (minutesAgoMatches) {
            t.setMinutes(t.getMinutes() - minutesAgoMatches[1]);
        }
        if (hoursAgoMatches) {
            t.setHours(t.getHours() - hoursAgoMatches[1]);
        }
        if (daysAgoMatches) {
            t.setDate(t.getDate() - daysAgoMatches[1]);
        }
        if (weeksAgoMatches) {
            t.setDate(t.getDate() - (weeksAgoMatches[1] * 7));
        }
        if (monthsAgoMatches) {
            t.setMonth(t.getMonth() - monthsAgoMatches[1]);
        }
        if (yearsAgoMatches) {
            t.setFullYear(t.getFullYear() - yearsAgoMatches[1]);
        }

        return t.toISOString();
    }

    async getPost ( rawPost ) {

        const post = new Post();

        post.text = `${ rawPost.body } <img src="${rawPost.imageUrl}">`;
        post.timestamp = this.getISOStringFromTimeAgo(rawPost.timeAgo);
        post.topicTitle = rawPost.topic;
        post.topicUrl = rawPost.url;
        post.url = rawPost.url;

        return post;
    }

    async loadRecentPosts () {
        let postsHtml;

        try {
            const response = await this.load.get( this.postsUrl, {
                body: JSON.stringify( {
                    date: new Date().toLocaleDateString( 'sv' ),
                    page: 1,
                    pagesize: 1,
                } ),
                headers: {
                    'content-type': 'application/json',
                },
                isJSON: true,
            } );

            if ( response ) {
                postsHtml = response.data.html;
            }
        } catch ( activitiesError ) {
            console.error( activitiesError );
        }

        if ( !postsHtml ) {
            return [];
        }

        const $ = cheerio.load( postsHtml );
        const rawPosts = [];

        $( 'a' ).each( ( index, element ) => {
            const $post = $( element );
            const matches = $post.attr('href').match( /(.*\/)([a-zA-Z0-9-]+)$/ );

            rawPosts.push( {
                identifier: "Comm-Link",
                postId: matches[ 2 ],
                title: $post.find( '.title' ).text(),
                body: $post.find('.body').text(),
                imageUrl: $post.find('.background').attr('style').match(/url\((.*)\)/)[1],
                timeAgo: $post.find('.time_ago').children("span").text(),
                url: `${ this.urlBase }${ $post.attr( 'href' ) }`,
            } );
        } );

        const postPromises = [];

        for ( let i = 0; i < rawPosts.length; i = i + 1 ) {
            if ( rawPosts[ i ].identifier !== this.userId ) {
                continue;
            }

            postPromises.push( this.getPost( rawPosts[ i ] ) );
        }

        return Promise.all( postPromises );
    }
}

module.exports = RSICommLink;
