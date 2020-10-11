export declare type Opts = {
    /** support retreiving oembed metadata */
    oembed?: boolean;
    /** req/res timeout in ms, it resets on redirect. 0 to disable (OS limit applies) */
    timeout?: number;
    /** maximum redirect count. 0 to not follow redirect */
    follow?: number;
    /** support gzip/deflate content encoding */
    compress?: boolean;
    /** maximum response body size in bytes. 0 to disable */
    size?: number;
    /** User-Agent string is often used for content negotiation */
    userAgent?: string;
};
export declare type Metadata = {
    vanilla: {
        title?: string;
        url?: string;
        favicons?: {
            url: string;
            size: string;
        }[];
        description?: string;
        subect?: string;
        summary?: string;
        keywords?: string[];
        copyright?: string;
        publisher?: string;
        creator?: string;
        author?: string;
        designer?: string;
        owner?: string;
        pubdate?: string;
        lastmod?: string;
        date_published?: string;
        theme_color?: string;
        color_scheme?: string;
    };
    oEmbed?: {
        type: 'photo' | 'video' | 'link' | 'rich';
        version?: string;
        title?: string;
        author_name?: string;
        author_url?: string;
        provider_name?: string;
        provider_url?: string;
        cache_age?: number;
        thumbnails?: [{
            url?: string;
            width?: number;
            height?: number;
        }];
    };
    twitter_card: {
        card: string;
        site?: string;
        creator?: string;
        creator_id?: string;
        title?: string;
        description?: string;
        players?: {
            url: string;
            stream?: string;
            height?: number;
            width?: number;
        }[];
        apps: {
            iphone: {
                id: string;
                name: string;
                url: string;
            };
            ipad: {
                id: string;
                name: string;
                url: string;
            };
            googleplay: {
                id: string;
                name: string;
                url: string;
            };
        };
        images: {
            url: string;
            alt: string;
        }[];
    }[];
    open_graph: {
        title: string;
        url?: string;
        site_name?: string;
        type: string;
        description?: string;
        determiner?: string;
        locale: string;
        locale_alt: string;
        pubdate: string;
        updated_time: string;
        articles?: {
            published_time: string;
            modified_time: string;
            expiration_time: string;
            author: string[];
            section: string;
            tag: string[];
        }[];
        books?: {
            author: string[];
            isbn: string;
            release_date: string;
            tag: string[];
        }[];
        profiles?: {
            first_name: string;
            last_name: string;
            username: string;
            profile: string;
        }[];
        images?: {
            url: string;
            secure_url?: string;
            type: string;
            width: number;
            height: number;
        }[];
        audio?: {
            url: string;
            secure_url?: string;
            type: string;
        }[];
        videos: {
            url: string;
            stream?: string;
            height?: number;
            width?: number;
            tags?: string[];
        }[];
    }[];
    linked_data: {
        type?: string;
        url?: string;
        headline?: string;
        publisher?: {
            name?: string;
            logo?: string;
        };
        date_modified?: string;
        date_published?: string;
        authors?: {
            type?: string;
            name?: string;
            logo?: string;
        }[];
        images?: {
            url?: string;
        }[];
        videos?: {
            url?: string;
        }[];
    };
};
