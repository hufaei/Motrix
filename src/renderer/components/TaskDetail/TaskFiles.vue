<template>
  <div class="mo-task-files" v-if="files">
    <div class="mo-table-wrapper">
      <el-table
        stripe
        ref="torrentTable"
        :height="height"
        :data="pagedFiles"
        tooltip-effect="dark"
        style="width: 100%"
        @row-dblclick="handleRowDbClick"
        @select-all="handleSelectAll"
        @selection-change="handleSelectionChange">
        <el-table-column
          type="selection"
          width="42">
        </el-table-column>
        <el-table-column
          :label="$t('task.file-name')"
          min-width="200"
          show-overflow-tooltip>
          <template slot-scope="scope">{{ scope.row.name }}</template>
        </el-table-column>
        <el-table-column
          :label="$t('task.file-extension')"
          width="80">
          <template slot-scope="scope">{{ scope.row.extension | removeExtensionDot }}</template>
        </el-table-column>
        <el-table-column
          v-if="mode === 'DETAIL'"
          :label="`%`"
          align="right"
          width="50">
          <template slot-scope="scope">{{ calcProgress(scope.row.length, scope.row.completedLength, 1) }}</template>
        </el-table-column>
        <el-table-column
          v-if="mode === 'DETAIL'"
          :label="`✓`"
          align="right"
          width="85">
          <template slot-scope="scope">{{ scope.row.completedLength | bytesToSize }}</template>
        </el-table-column>
        <el-table-column
          :label="$t('task.file-size')"
          align="right"
          width="85">
          <template slot-scope="scope">{{ scope.row.length | bytesToSize }}</template>
        </el-table-column>
      </el-table>
    </div>
    <el-pagination
      v-if="files.length > pageSize"
      class="file-pagination"
      small
      layout="prev, pager, next"
      :current-page="currentPage"
      :page-size="pageSize"
      :total="files.length"
      @current-change="handlePageChange"
    />
    <el-row class="file-filters" :gutter="12">
      <el-col
        class="quick-filters"
        :xs="24"
        :sm="8"
        :md="8"
        :lg="8"
      >
        <el-button-group>
          <el-button @click="toggleVideoSelection()">
            <mo-icon name="video" width="12" height="12" />
          </el-button>
          <el-button @click="toggleAudioSelection()">
            <mo-icon name="audio" width="12" height="12" />
          </el-button>
          <el-button @click="toggleImageSelection()">
            <mo-icon name="image" width="12" height="12" />
          </el-button>
        </el-button-group>
      </el-col>
      <el-col
        class="files-summary"
        :xs="24"
        :sm="16"
        :md="16"
        :lg="16"
      >
        {{ $t('task.selected-files-sum', { selectedFilesCount, selectedFilesTotalSize }) }}
      </el-col>
    </el-row>
  </div>
</template>

<script>
  import { isEmpty } from 'lodash'
  import '@/components/Icons/video'
  import '@/components/Icons/audio'
  import '@/components/Icons/image'
  import {
    NONE_SELECTED_FILES,
    SELECTED_ALL_FILES
  } from '@shared/constants'
  import {
    bytesToSize,
    calcProgress,
    filterVideoFiles,
    filterAudioFiles,
    filterImageFiles,
    removeExtensionDot
  } from '@shared/utils'

  export default {
    name: 'mo-task-files',
    filters: {
      bytesToSize,
      removeExtensionDot
    },
    props: {
      mode: {
        type: String,
        default: 'ADD',
        validator: function (value) {
          return ['ADD', 'DETAIL'].indexOf(value) !== -1
        }
      },
      height: {
        type: [Number, String]
      },
      files: {
        type: Array,
        default: function () {
          return []
        }
      }
    },
    data () {
      return {
        selectedFiles: [],
        currentPage: 1,
        pageSize: 200,
        syncingSelection: false
      }
    },
    computed: {
      pagedFiles () {
        const start = (this.currentPage - 1) * this.pageSize
        return this.files.slice(start, start + this.pageSize)
      },
      selectedFileIndexSet () {
        return new Set(this.selectedFiles.map(item => String(item.idx)))
      },
      selectedFilesCount () {
        return this.selectedFiles.length
      },
      selectedFilesTotalSize () {
        const result = this.selectedFiles.reduce((acc, cur) => {
          return acc + parseInt(cur.length, 10)
        }, 0)
        return bytesToSize(result)
      },
      selectedFileIndex () {
        const { files, selectedFiles } = this
        if (files.length === 0 || selectedFiles.length === 0) {
          return NONE_SELECTED_FILES
        }
        if (files.length === selectedFiles.length) {
          return SELECTED_ALL_FILES
        }
        const indexArr = this.selectedFiles.map((item) => item.idx)
        const result = indexArr.join(',')
        return result
      }
    },
    watch: {
      files (files, previousFiles) {
        const wasAllSelected = previousFiles.length > 0 &&
          this.selectedFiles.length === previousFiles.length
        const selectedIndexes = this.selectedFileIndexSet
        this.currentPage = 1
        this.selectedFiles = wasAllSelected
          ? files.slice()
          : files.filter(item => selectedIndexes.has(String(item.idx)))
        this.$nextTick(this.restorePageSelection)
      },
      selectedFileIndex () {
        const { selectedFileIndex } = this
        this.$emit('selection-change', selectedFileIndex)
      }
    },
    methods: {
      calcProgress,
      toggleAllSelection () {
        this.$nextTick(() => {
          this.selectedFiles = this.files.slice()
          this.restorePageSelection()
        })
      },
      clearSelection () {
        this.selectedFiles = []
        this.$nextTick(this.restorePageSelection)
      },
      toggleSelection (rows) {
        this.selectedFiles = isEmpty(rows) ? [] : rows.slice()
        this.$nextTick(this.restorePageSelection)
      },
      restorePageSelection () {
        const table = this.$refs.torrentTable
        if (!table) {
          return
        }
        this.syncingSelection = true
        table.clearSelection()
        this.pagedFiles.forEach(row => {
          if (this.selectedFileIndexSet.has(String(row.idx))) {
            table.toggleRowSelection(row, true)
          }
        })
        this.syncingSelection = false
      },
      toggleVideoSelection () {
        const filtered = filterVideoFiles(this.files)
        this.toggleSelection(filtered)
      },
      toggleAudioSelection () {
        const filtered = filterAudioFiles(this.files)
        this.toggleSelection(filtered)
      },
      toggleImageSelection () {
        const filtered = filterImageFiles(this.files)
        this.toggleSelection(filtered)
      },
      handleRowDbClick (row, column, event) {
        this.$refs.torrentTable.toggleRowSelection(row)
      },
      handleSelectAll (selection) {
        this.selectedFiles = selection.length === 0 ? [] : this.files.slice()
      },
      handlePageChange (page) {
        this.syncingSelection = true
        this.currentPage = page
        this.$nextTick(this.restorePageSelection)
      },
      handleSelectionChange (val) {
        if (this.syncingSelection) {
          return
        }
        const pageIndexes = new Set(this.pagedFiles.map(item => String(item.idx)))
        this.selectedFiles = this.selectedFiles
          .filter(item => !pageIndexes.has(String(item.idx)))
          .concat(val)
      }
    }
  }
</script>

<style lang="scss">
.file-filters {
  margin-top: 0.5rem;
  .quick-filters {
    button {
      font-size: 0;
    }
  }
  .files-summary {
    text-align: right;
    font-size: $--font-size-base;
    color: $--color-text-regular;
    line-height: 1.75rem;
  }
}
.file-pagination {
  margin-top: 0.5rem;
  text-align: right;
}
</style>
