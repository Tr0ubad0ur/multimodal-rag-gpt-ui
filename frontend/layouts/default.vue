<template>
  <div class="min-h-screen bg-[radial-gradient(circle_at_top,_#f0f9ff,_#f8fafc_45%,_#eef2ff)] text-slate-900 dark:bg-[radial-gradient(circle_at_top,_#0f172a,_#020617_55%,_#0b1120)] dark:text-slate-100">
    <AppHeader />
    <div class="mx-auto w-full max-w-7xl px-4 pb-8 pt-6 sm:px-6 lg:px-8">
      <slot />
    </div>
    <AppFooter />
  </div>
</template>
