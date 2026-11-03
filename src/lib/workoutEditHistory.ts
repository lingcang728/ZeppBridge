import { ref } from 'vue';

// Keep the undo receipt when hiding a workout navigates from its detail to the list.
// Only the latest successful edit replaces it; a failed edit/undo leaves it available.
export const lastWorkoutEditId = ref<string | null>(null);
