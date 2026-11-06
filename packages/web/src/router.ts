import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

/** Views inside a session; the session is the boundary of what they show. */
export const SESSION_VIEWS = ['tree', 'board', 'focus', 'history'] as const;
export type SessionView = (typeof SESSION_VIEWS)[number];

// Path params identify things (project, session, view, task); query only holds filtering and paging.
const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
  { path: '/p/:projectKey', name: 'project', component: () => import('./views/ProjectView.vue') },
  {
    path: '/s/:sessionId',
    component: () => import('./views/SessionLayout.vue'),
    children: [
      { path: '', redirect: to => ({ name: 'tree', params: to.params }) },
      { path: 'tree/:taskId?', name: 'tree', component: () => import('./views/TreeView.vue') },
      { path: 'board/:taskId?', name: 'board', component: () => import('./views/BoardView.vue') },
      { path: 'focus/:taskId?', name: 'focus', component: () => import('./views/FocusView.vue') },
      { path: 'history/:taskId?', name: 'history', component: () => import('./views/HistoryView.vue') },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({ history: createWebHistory(), routes });
