export namespace main {
	
	export class BookFrontend {
	    name: string;
	    cover: string;
	    tags: string[];
	    description: string;
	    is_locked: boolean;
	    is_hidden: boolean;
	    mask_cover: boolean;
	    last_page: number;
	    is_favorite: boolean;
	    last_read_time: number;
	
	    static createFrom(source: any = {}) {
	        return new BookFrontend(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.cover = source["cover"];
	        this.tags = source["tags"];
	        this.description = source["description"];
	        this.is_locked = source["is_locked"];
	        this.is_hidden = source["is_hidden"];
	        this.mask_cover = source["mask_cover"];
	        this.last_page = source["last_page"];
	        this.is_favorite = source["is_favorite"];
	        this.last_read_time = source["last_read_time"];
	    }
	}
	export class SearchQuery {
	    query: string;
	    tags: string[];
	    sort_by: string;
	    only_fav: boolean;
	    page: number;
	    limit: number;
	
	    static createFrom(source: any = {}) {
	        return new SearchQuery(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.query = source["query"];
	        this.tags = source["tags"];
	        this.sort_by = source["sort_by"];
	        this.only_fav = source["only_fav"];
	        this.page = source["page"];
	        this.limit = source["limit"];
	    }
	}

}

