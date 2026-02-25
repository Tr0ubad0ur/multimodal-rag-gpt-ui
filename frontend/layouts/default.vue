<template>
  <div class="min-h-screen bg-[radial-gradient(circle_at_top,_rgb(var(--color-brand-soft))_0%,_rgb(var(--color-canvas))_42%)] text-foreground">
    <AppHeader />
    <div class="mx-auto w-full max-w-7xl px-4 pb-8 pt-6 sm:px-6 lg:px-8">
      <slot />
    </div>
    <AppFooter />
  </div>
</template>
