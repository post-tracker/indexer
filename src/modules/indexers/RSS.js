const FeedMe = require( 'feedme' );
const moment = require( 'moment' );

const Post = require( '../Post.js' );

class RSS {
    constructor ( userId, indexerConfig, hashes, load ) {
        this.path = indexerConfig.endpoint;

        this.postList = [];
        this.load = load;
    }

    async loadRecentPosts () {
        const posts = await this.load.get( this.path );
        const parser = new FeedMe();

        parser.on( 'item', ( item ) => {
            const post = new Post();

            if ( typeof item.guid === 'object' ) {
                if ( item.guid.ispermalink ) {
                    post.url = item.guid.text;
                }
            }

            if ( !post.url ) {
                post.url = item.link;
            }

            post.text = item.description;
            post.timestamp = moment( item.pubdate ).unix();
            post.topicTitle = item.title;

            this.postList.push( post );
        } );

        parser.write( posts );

        return this.postList;
    }
}

module.exports = RSS;
