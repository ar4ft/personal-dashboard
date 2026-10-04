export const sections = {
  news: { title: 'News & reading', eyebrow: 'Your reading list', description: 'Stories to read, save, and follow.', filters: ['All', 'Hacker News', 'Twitter / X', 'Reading'] },
  ideas: { title: 'Project ideas', eyebrow: 'Your project board', description: 'Capture an idea. Choose what to build.', filters: ['All', 'Explore', 'Build', 'Later'] },
  planning: { title: 'Todos & calendar', eyebrow: 'Your next steps', description: 'Tasks and dates, on your board.', filters: ['All', 'Today', 'Upcoming', 'Someday', 'Calendar'] },
};
export function slug(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
export function route(base, path = '') { return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`; }
export function select(items, field, filter) { return filter === 'All' ? items : items.filter(item => item[field] === filter); }
