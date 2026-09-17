<template>
  <el-card class="link-card" shadow="hover" :class="{ 'read-later': link.is_read_later }">
    <div class="card-content">
      <div class="card-header">
        <h3 class="link-title">
          <a :href="link.url" target="_blank" rel="noopener noreferrer">{{ link.title }}</a>
        </h3>
        <div class="header-actions">
          <el-tooltip :content="link.is_read_later ? '已加入稍后阅读' : '加入稍后阅读'" placement="top">
            <el-button
              text
              circle
              :class="{ 'read-later-active': link.is_read_later }"
              @click.stop="handleReadLater"
            >
              <el-icon><Clock /></el-icon>
            </el-button>
          </el-tooltip>
          <el-dropdown trigger="click" @command="handleCommand">
            <el-button text circle>
              <el-icon><MoreFilled /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="edit">编辑</el-dropdown-item>
                <el-dropdown-item v-if="!link.is_read_later" command="read-later">加入稍后阅读</el-dropdown-item>
                <el-dropdown-item v-else command="remove-read-later">从稍后阅读移除</el-dropdown-item>
                <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <p class="link-url">{{ displayUrl }}</p>
      <p class="link-description" v-if="link.description">{{ link.description }}</p>

      <div class="card-footer">
        <div class="tags">
          <el-tag
            v-for="tag in link.tags"
            :key="tag"
            size="small"
            effect="plain"
            @click="$emit('tag-click', tag)"
          >
            {{ tag }}
          </el-tag>
        </div>
        <div class="meta">
          <el-tag
            v-if="link.category_name"
            :color="link.category_color"
            effect="dark"
            size="small"
          >
            {{ link.category_name }}
          </el-tag>
          <span class="status-indicator" :class="link.status">
            <el-icon v-if="link.status === 'alive'" color="#67C23A"><CircleCheck /></el-icon>
            <el-icon v-else-if="link.status === 'dead'" color="#F56C6C"><CircleClose /></el-icon>
            <el-icon v-else color="#909399"><QuestionFilled /></el-icon>
          </span>
        </div>
      </div>
    </div>
  </el-card>
</template>

<script setup>
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Clock } from '@element-plus/icons-vue'
import { linksApi } from '../api'
import { useLinksStore } from '../stores/links'
import { getUrlHost } from '../utils/link-utils'

const props = defineProps({
  link: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['edit', 'delete', 'tag-click'])
const linksStore = useLinksStore()

const displayUrl = computed(() => getUrlHost(props.link.url))

async function handleReadLater() {
  try {
    if (props.link.is_read_later) {
      await linksApi.removeFromReadLater(props.link.id)
      ElMessage.success('已从稍后阅读移除')
    } else {
      await linksApi.addToReadLater(props.link.id)
      ElMessage.success('已加入稍后阅读')
    }
    await linksStore.fetchLinks(linksStore.currentPage)
  } catch (error) {
    ElMessage.error('操作失败')
  }
}

function handleCommand(command) {
  if (command === 'edit') {
    emit('edit', props.link)
  } else if (command === 'delete') {
    emit('delete', props.link)
  } else if (command === 'read-later') {
    handleReadLater()
  } else if (command === 'remove-read-later') {
    handleReadLater()
  }
}
</script>

<style scoped>
.link-card {
  height: 100%;
  transition: transform 0.2s;
}

.link-card.read-later {
  border-left: 3px solid #e6a23c;
}

.link-card:hover {
  transform: translateY(-2px);
}

.card-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 8px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.read-later-active {
  color: #e6a23c !important;
}

.link-title {
  flex: 1;
  margin: 0;
  font-size: 16px;
  line-height: 1.4;
}

.link-title a {
  color: #303133;
  text-decoration: none;
}

.link-title a:hover {
  color: #409eff;
}

.link-url {
  margin: 0 0 8px 0;
  font-size: 12px;
  color: #909399;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-description {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #606266;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex: 1;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: auto;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tags .el-tag {
  cursor: pointer;
}

.meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-indicator {
  display: flex;
  align-items: center;
}
</style>
