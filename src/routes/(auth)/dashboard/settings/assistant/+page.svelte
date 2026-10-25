<script lang="ts">
  import {
    SettingsGroup,
    SettingsField,
    SettingsBlock,
  } from '$lib/components/settings'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Label } from '$lib/components/ui/label'
  import { Spinner } from '$lib/components/ui/spinner'
  import { cn } from '$lib/utils'
  import { Plus, X, Check, UserRound, House } from 'lucide-svelte'
  import toast from 'svelte-hot-french-toast'
  import type { PageData } from './$types'
  import { untrack } from 'svelte'

  let { data }: { data: PageData } = $props()

  const start = untrack(() => data.profile)

  let callName = $state(start.callName)
  let about = $state(start.about)
  let objects = $state([...start.objects])
  let services = $state([...start.services])
  let saving = $state(false)

  const snapshot = $derived(
    JSON.stringify({ callName, about, objects, services }),
  )
  let savedSnapshot = $state(JSON.stringify(start))
  const dirty = $derived(snapshot !== savedSnapshot)

  function toggleService(key: string): void {
    services = services.includes(key)
      ? services.filter((s) => s !== key)
      : [...services, key]
  }

  function addObject(): void {
    if (objects.length >= data.limits.maxObjects) {
      toast.error(`Максимум ${data.limits.maxObjects} об'єкти`)
      return
    }
    objects = [...objects, { premise: data.premises[0].key, note: '' }]
  }

  function removeObject(i: number): void {
    objects = objects.filter((_, idx) => idx !== i)
  }

  async function save(): Promise<void> {
    if (saving || !dirty) return
    saving = true

    try {
      const res = await fetch('/api/profile/ai-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callName, about, objects, services }),
      })

      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j?.message ?? 'Не вдалося зберегти')
        return
      }

      savedSnapshot = snapshot
      toast.success('Збережено')
    } catch {
      toast.error("Помилка з'єднання")
    } finally {
      saving = false
    }
  }
</script>

<div>
  <!-- ═══ Звертання ═══
       Вступ до всього розділу — описом першої групи: у дві колонки
       окремий абзац над ними висів би сам по собі. -->
  <SettingsGroup
    title="Про вас"
    footnote="Zunor враховуватиме це, оформлюючи заявку — і не питатиме те, що ви вже вказали."
  >
    <SettingsField label="Як звертатись" for="call-name">
      {#snippet control()}
        <Input
          id="call-name"
          icon={UserRound}
          bind:value={callName}
          maxlength={40}
          placeholder={data.userName || 'Ваше імʼя'}
          class="bg-background"
        />
      {/snippet}
    </SettingsField>

    <SettingsBlock>
      <Label for="about" class="text-sm font-normal">Чим займаєтесь</Label>
      <p class="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
        Наприклад: здаю квартири подобово, тому прибирання потрібне часто і
        швидко.
      </p>
      <Textarea
        id="about"
        bind:value={about}
        rows={3}
        maxlength={data.limits.about}
        placeholder="Кілька речень про вас і ваші потреби."
        class="mt-2 resize-none bg-background"
      />
      <!-- Лічильник з'являється лише коли є що рахувати: під порожнім
           полем «0/922» читається як помилка, а не як підказка. -->
      {#if about.length > 0}
        <div class="mt-1.5 flex justify-end">
          <span class="text-[12px] tabular-nums text-muted-foreground">
            {about.length}/{data.limits.about}
          </span>
        </div>
      {/if}
    </SettingsBlock>
  </SettingsGroup>

  <!-- ═══ Об'єкти ═══ -->
  <SettingsGroup
    title="Ваші обʼєкти"
    footnote="Те, що прибираєте регулярно, — асистент не питатиме щоразу."
  >

    {#each objects as obj, i (i)}
      <SettingsBlock>
        <div class="flex items-start gap-2">
          <div class="min-w-0 flex-1 space-y-2">
            <!-- Тип — чіпи, а не селект: варіантів п'ять, усі видно одразу -->
            <div class="flex flex-wrap gap-1.5">
              {#each data.premises as p (p.key)}
                <button
                  type="button"
                  onclick={() => (objects[i].premise = p.key)}
                  aria-pressed={obj.premise === p.key}
                  class={cn(
                    'rounded-[8px] border px-3 py-1 text-[12.5px] transition-colors',
                    obj.premise === p.key
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-background text-foreground hover:bg-accent',
                  )}
                >
                  {p.label}
                </button>
              {/each}
            </div>

            <Input
              icon={House}
              bind:value={objects[i].note}
              maxlength={data.limits.objectNote}
              placeholder="3 кімнати, Таїрова, 5 поверх без ліфта"
              class="bg-background"
              aria-label="Деталі обʼєкта"
            />
          </div>

          <button
            type="button"
            onclick={() => removeObject(i)}
            class="mt-1 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Видалити обʼєкт"
          >
            <X class="size-4" aria-hidden="true" />
          </button>
        </div>
      </SettingsBlock>
    {/each}

    <SettingsBlock>
      <button
        type="button"
        onclick={addObject}
        disabled={objects.length >= data.limits.maxObjects}
        class="flex cursor-pointer items-center gap-2 rounded-md py-1 text-[14px] text-primary transition-colors hover:text-primary-hover disabled:cursor-default disabled:opacity-50"
      >
        <Plus class="size-4" aria-hidden="true" />
        Додати обʼєкт
      </button>
    </SettingsBlock>
  </SettingsGroup>

  <!-- ═══ Послуги ═══ -->
  <SettingsGroup
    title="Що вас цікавить"
    footnote="Асистент пропонуватиме це першим. Анкета — довідка про вас, а не команда асистенту: вказівки щодо його поведінки він проігнорує."
  >
    <SettingsBlock>
      <div class="flex flex-wrap gap-2">
        {#each data.services as s (s.key)}
          {@const selected = services.includes(s.key)}
          <button
            type="button"
            onclick={() => toggleService(s.key)}
            aria-pressed={selected}
            class={cn(
              'inline-flex items-center gap-1.5 rounded-[8px] border px-3.5 py-1.5 text-[13px] transition-colors',
              selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input bg-background text-foreground hover:bg-accent',
            )}
          >
            {#if selected}
              <Check class="size-3.5" aria-hidden="true" />
            {/if}
            {s.label}
          </button>
        {/each}
      </div>
    </SettingsBlock>
  </SettingsGroup>

  <div class="mt-8 flex justify-end">
    <Button
      onclick={save}
      disabled={saving || !dirty}
      aria-busy={saving}
      variant="primary"
      class="relative min-w-27.5"
    >
      {#if saving}
        <Spinner class="animate-spin" aria-hidden="true" />
        <span class="sr-only">Зберігаємо...</span>
      {:else}
        <span>Зберегти</span>
      {/if}
    </Button>
  </div>
</div>
