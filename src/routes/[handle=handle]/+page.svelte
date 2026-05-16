<!-- src/routes/[handle=handle]/+page.svelte -->
<script lang="ts">
  import FreelancerProfileView from '$lib/components/profile/freelancer-profile-view.svelte'
  import ClientProfileView from '$lib/components/profile/client-profile-view.svelte'
  import { page } from '$app/state'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  const profileUrl = $derived(`/@${data.user.username}`)
  const canonicalUrl = $derived(`${page.url.origin}${profileUrl}`)

  // ─── SEO derived ───
  const isMaster = $derived(data.profileType === 'master')

  const seoTitle = $derived.by(() => {
    if (!isMaster) {
      return `${data.user.name} · Zunor`
    }
    const u = data.user as Extract<typeof data.user, { categories: string[] }>
    const hint = u.categories?.[0] ?? u.city ?? 'майстер'
    return `${data.user.name} (@${data.user.username}) — ${hint} · Zunor`
  })

  const seoDescription = $derived.by(() => {
    if (!isMaster) return ''
    const u = data.user as Extract<typeof data.user, { categories: string[] }>
    const cleanBio = u.bio?.replace(/\s+/g, ' ').trim()
    if (cleanBio && cleanBio.length >= 40) {
      return cleanBio.slice(0, 160)
    }
    const parts: string[] = [`${data.user.name} — майстер на Zunor`]
    if (u.categories?.length)
      parts.push(`категорії: ${u.categories.slice(0, 3).join(', ')}`)
    if (u.city) parts.push(`місто: ${u.city}`)
    return parts.join(' · ').slice(0, 160)
  })

  const shouldIndex = $derived(
    isMaster &&
      'verificationStatus' in data.user &&
      data.user.verificationStatus === 'VERIFIED',
  )
</script>

<svelte:head>
  <title>{seoTitle}</title>
  {#if seoDescription}
    <meta name="description" content={seoDescription} />
  {/if}
  <link rel="canonical" href={canonicalUrl} />

  {#if isMaster}
    {#if shouldIndex}
      <meta name="robots" content="index, follow, max-image-preview:large" />
    {:else}
      <meta name="robots" content="noindex, follow" />
    {/if}
  {:else}
    <meta name="robots" content="noindex, nofollow" />
  {/if}

  {#if isMaster}
    <meta property="og:type" content="profile" />
    <meta property="og:title" content={seoTitle} />
    {#if seoDescription}
      <meta property="og:description" content={seoDescription} />
    {/if}
    <meta property="og:url" content={canonicalUrl} />
    <meta property="og:site_name" content="Zunor" />
    <meta property="og:locale" content="uk_UA" />
    {#if data.user.avatar}
      <meta property="og:image" content={data.user.avatar} />
      <meta property="og:image:alt" content="Аватар {data.user.name}" />
    {/if}

    {#if data.user.username}
      <meta property="profile:username" content={data.user.username} />
    {/if}

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={seoTitle} />
    {#if seoDescription}
      <meta name="twitter:description" content={seoDescription} />
    {/if}
    {#if data.user.avatar}
      <meta name="twitter:image" content={data.user.avatar} />
    {/if}
  {/if}
</svelte:head>

{#if data.profileType === 'master'}
  <FreelancerProfileView
    user={data.user}
    isOwner={false}
    isAuthenticated={data.isAuthenticated}
  />
{:else}
  <ClientProfileView
    user={data.user}
    isOwner={false}
    isAuthenticated={data.isAuthenticated}
  />
{/if}
