export const sections = {
  news: { title: 'News & reading', eyebrow: 'STAY CURIOUS', description: 'Good ideas start with good inputs. Keep your favorite corners of the internet close.', filters: ['All', 'Hacker News', 'Twitter / X', 'Reading'] },
  ideas: { title: 'Project ideas', eyebrow: 'MAKE ROOM FOR POSSIBILITY', description: 'A home for the things you might make. From a passing thought to your next small launch.', filters: ['All', 'Explore', 'Build', 'Later'] },
  planning: { title: 'Todos & calendar', eyebrow: 'A LITTLE INTENTION', description: 'Choose what matters today. Make room for it in the week ahead.', filters: ['All', 'Today', 'Upcoming', 'Someday', 'Calendar'] },
};
export function slug(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
export function route(base, path = '') { return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`; }
export function select(items, field, filter) { return filter === 'All' ? items : items.filter(item => item[field] === filter); }
