import type ko from '../ko/home';
import type { Translation } from '../../types';

const en: Translation<typeof ko> = {
  home: {
    notificationsUnread: 'Notifications, {{count}} unread',
    loadFailed: {
      title: "Couldn't load Home",
      description: 'Check your connection and try again.',
    },
    notice: 'Notice',
    categories: 'Categories',
    sections: {
      live: 'Live auctions',
      endingSoon: 'Ending soon',
      upcoming: 'Starting soon',
      newArrivals: 'New arrivals',
      popular: 'Popular artworks',
      popularArtists: 'Popular artists',
    },
    artistA11y: '{{name}}, {{count}} artworks',
    artistCount: '{{count}} artworks',
    bannerA11y: 'Banner {{current}} of {{total}}',
  },
  auctions: {
    status: 'Auction status',
    tabs: {
      live: 'Live',
      scheduled: 'Upcoming',
      ended: 'Ended',
    },
    empty: {
      live: 'No live auctions',
      scheduled: 'No upcoming auctions',
      ended: 'No ended auctions',
    },
  },
  search: {
    placeholder: 'Search artworks, artists, eras',
    inputA11y: 'Search artworks and artists',
    searchFor: 'Search for “{{query}}”',
    kind: {
      category: 'Category',
      artist: 'Artist',
      artwork: 'Artwork',
    },
    recent: 'Recent searches',
    clearRecent: 'Clear all',
  },
  list: {
    sort: 'Sort',
    empty: 'No artworks match your filters',
  },
  artist: {
    empty: 'No artworks for sale',
  },
  feed: {
    empty: {
      title: 'No new artworks',
      description: "Follow sellers you like and you'll see their new artworks here.",
      action: 'Browse artworks',
    },
  },
  notices: {
    empty: 'No notices yet',
    notFound: "Couldn't find this notice",
  },
  card: {
    priceOnRequest: 'Price on request',
  },
  filter: {
    title: 'Filters',
    titleCount: 'Filters {{count}}',
    appliedA11y: 'Filters, {{count}} applied',
    saleType: 'Sale type',
    price: 'Price',
    min: 'Min',
    max: 'Max',
    condition: 'Condition',
    era: 'Era',
    material: 'Material',
    region: 'Location',
    verifiedOnly: 'Verified artworks only',
  },
};

export default en;
