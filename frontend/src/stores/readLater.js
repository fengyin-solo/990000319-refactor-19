import { defineStore } from 'pinia'
import { ref } from 'vue'
import { linksApi } from '../api'
import { normalizeLink } from '../utils/link-utils'

export const useReadLaterStore = defineStore('readLater', () => {
  const links = ref([])
  const total = ref(0)
  const currentPage = ref(1)
  const totalPages = ref(1)
  const loading = ref(false)
  const stats = ref({
    pending: 0,
    completed: 0,
    skipped: 0,
    total: 0,
  })

  const filterStatus = ref('pending')

  async function fetchReadLater(page = 1, status = filterStatus.value) {
    loading.value = true
    try {
      const response = await linksApi.getReadLater({
        page,
        limit: 12,
        status,
      })
      links.value = response.data.links.map(normalizeLink)
      total.value = response.data.total
      currentPage.value = response.data.page
      totalPages.value = response.data.totalPages
      stats.value = response.data.stats
      filterStatus.value = status
    } catch (error) {
      console.error('Failed to fetch read later list:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function addToReadLater(linkId, reviewDate = null) {
    const response = await linksApi.addToReadLater(linkId, reviewDate)
    await fetchReadLater(currentPage.value)
    return response.data
  }

  async function removeFromReadLater(linkId) {
    await linksApi.removeFromReadLater(linkId)
    await fetchReadLater(currentPage.value)
  }

  async function updateReviewStatus(linkId, status) {
    const response = await linksApi.updateReviewStatus(linkId, status)
    await fetchReadLater(currentPage.value)
    return response.data
  }

  function setFilterStatus(status) {
    filterStatus.value = status
    fetchReadLater(1, status)
  }

  return {
    links,
    total,
    currentPage,
    totalPages,
    loading,
    stats,
    filterStatus,
    fetchReadLater,
    addToReadLater,
    removeFromReadLater,
    updateReviewStatus,
    setFilterStatus,
  }
})
