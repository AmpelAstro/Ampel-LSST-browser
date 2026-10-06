import { createRouter, createWebHistory } from "vue-router";
import RecentView from "./RecentView.vue";
import ObjectView from "./ObjectView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "recent", component: RecentView },
    { path: "/stock/:id", name: "stock", component: ObjectView, props: true },
  ],
});
