<template>
  <el-upload
    class="upload-torrent"
    drag
    action="/"
    v-if="isTorrentsEmpty"
    :limit="1"
    :multiple="true"
    accept=".torrent"
    :on-change="handleChange"
    :on-exceed="handleExceed"
    :auto-upload="false"
    :show-file-list="false">
    <i class="upload-inbox-icon"><mo-icon name="inbox" width="24" height="24" /></i>
    <div class="el-upload__text">
      {{ $t('task.select-torrent') }}
      <div class="torrent-name" v-if="name">{{ name }}</div>
    </div>
  </el-upload>
  <div
    class="selective-torrent"
    v-else
  >
    <el-row class="torrent-info" :gutter="12">
      <el-col class="torrent-name" :span="20">
        <span v-if="isBatch">
          {{ $t('task.torrent-task') }} ({{ batchTorrentItems.length || torrents.length }})
        </span>
        <el-tooltip v-else class="item" effect="dark" :content="name" placement="top">
          <span>{{ name }}</span>
        </el-tooltip>
      </el-col>
      <el-col class="torrent-actions" :span="4">
        <span @click="handleTrashClick">
          <mo-icon name="trash" width="14" height="14" />
        </span>
      </el-col>
    </el-row>
    <el-collapse
      v-if="isBatch"
      v-model="activeBatchTorrentKeys"
      class="batch-torrent-list"
    >
      <el-collapse-item
        v-for="torrentItem in batchTorrentItems"
        :key="torrentItem.identity"
        :name="torrentItem.identity"
        :disabled="!torrentItem.valid"
      >
        <template slot="title">
          <el-tooltip
            effect="dark"
            :content="torrentItem.sourceName"
            placement="top"
          >
            <span :class="['batch-torrent-title', { 'invalid-torrent': !torrentItem.valid }]">
              {{ torrentItem.name }}
            </span>
          </el-tooltip>
          <span v-if="torrentItem.valid" class="batch-torrent-summary">
            {{ torrentItem.files.length }} · {{ torrentItem.length | bytesToSize }}
          </span>
          <span v-else class="invalid-torrent-mark">×</span>
        </template>
        <mo-task-files
          v-if="torrentItem.valid"
          ref="batchTorrentFileLists"
          mode="ADD"
          :files="torrentItem.files"
          :height="200"
          @selection-change="handleBatchFileSelectionChange(torrentItem, $event)"
        />
      </el-collapse-item>
    </el-collapse>
    <mo-task-files
      v-if="!isBatch"
      ref="torrentFileList"
      mode="ADD"
      :files="files"
      :height="200"
      @selection-change="handleSelectionChange"
    />
  </div>
</template>

<script>
  import { mapState } from 'vuex'
  import { remote } from 'parse-torrent'
  import TaskFiles from '@/components/TaskDetail/TaskFiles'
  import '@/components/Icons/inbox'
  import {
    EMPTY_STRING,
    NONE_SELECTED_FILES,
    SELECTED_ALL_FILES
  } from '@shared/constants'
  import {
    buildFileList,
    listTorrentFiles,
    bytesToSize,
    getAsBase64,
    getTorrentFileKey,
    removeExtensionDot
  } from '@shared/utils'

  export default {
    name: 'mo-select-torrent',
    components: {
      [TaskFiles.name]: TaskFiles
    },
    filters: {
      bytesToSize,
      removeExtensionDot
    },
    props: {
    },
    data () {
      return {
        name: EMPTY_STRING,
        currentTorrent: EMPTY_STRING,
        batchTorrentItems: [],
        activeBatchTorrentKeys: [],
        forceBatchMode: false,
        files: [],
        selectedFiles: []
      }
    },
    computed: {
      ...mapState('app', {
        torrents: state => state.addTaskTorrents
      }),
      ...mapState('preference', {
        config: state => state.config
      }),
      isTorrentsEmpty () {
        return this.torrents.length === 0
      },
      isBatch () {
        return this.torrents.length > 1 || this.forceBatchMode
      }
    },
    watch: {
      torrents (fileList) {
        if (fileList.length === 0) {
          this.reset()
          return
        }

        if (fileList.length > 1) {
          this.loadBatchTorrents(fileList)
          return
        }

        const file = fileList[0]
        if (!file.raw) {
          this.showInvalidSingleTorrent(file)
          return
        }

        this.$emit('loading-change', true)
        remote(file.raw, { timeout: 60 * 1000 }, (err, parsedTorrent) => {
          if (this.torrents !== fileList) {
            return
          }
          if (err) {
            this.showInvalidSingleTorrent(file)
            return
          }

          this.forceBatchMode = false
          console.log('[Motrix] parsed torrent: ', parsedTorrent)
          this.files = listTorrentFiles(parsedTorrent.files)
          this.$refs.torrentFileList.toggleAllSelection()

          getAsBase64(file.raw, (torrent) => {
            if (this.torrents !== fileList) {
              return
            }
            this.name = file.name
            this.currentTorrent = torrent
            this.$emit('loading-change', false)
            this.$emit('change', torrent, SELECTED_ALL_FILES)
          }, () => {
            if (this.torrents !== fileList) {
              return
            }
            this.showInvalidSingleTorrent(file)
          })
        })
      }
    },
    methods: {
      loadBatchTorrents (fileList) {
        const previousItems = this.batchTorrentItems
        const previousItemMap = previousItems.reduce((result, item) => {
          result[item.identity] = item
          return result
        }, {})
        const torrentItems = new Array(fileList.length)
        let loaded = 0
        this.forceBatchMode = true
        this.$emit('loading-change', true)

        const completeItem = (index, item) => {
          if (this.torrents !== fileList) {
            return
          }

          torrentItems[index] = item
          loaded += 1
          if (loaded !== fileList.length) {
            return
          }

          const seen = new Set()
          const uniqueItems = torrentItems.filter(torrentItem => {
            if (seen.has(torrentItem.identity)) {
              return false
            }
            seen.add(torrentItem.identity)
            return true
          })

          this.batchTorrentItems = uniqueItems
          this.activeBatchTorrentKeys = uniqueItems
            .filter(torrentItem => torrentItem.valid)
            .map(torrentItem => torrentItem.identity)
          this.$nextTick(() => {
            if (this.torrents !== fileList) {
              return
            }

            this.restoreBatchFileSelections()
            this.$emit('loading-change', false)
          })
        }

        fileList.forEach((file, index) => {
          const fileKey = getTorrentFileKey(file)
          const invalidItem = {
            identity: `file:${fileKey}`,
            uid: file.uid,
            sourceName: file.name,
            name: file.name,
            length: 0,
            files: [],
            torrent: EMPTY_STRING,
            selectFile: NONE_SELECTED_FILES,
            valid: false
          }

          if (!file.raw) {
            completeItem(index, invalidItem)
            return
          }

          remote(file.raw, { timeout: 60 * 1000 }, (err, parsedTorrent) => {
            if (this.torrents !== fileList) {
              return
            }
            if (err) {
              completeItem(index, invalidItem)
              return
            }

            getAsBase64(file.raw, (torrent) => {
              const identity = parsedTorrent.infoHash
                ? `hash:${parsedTorrent.infoHash}`
                : `file:${fileKey}`
              const previousItem = previousItemMap[identity]
              const files = listTorrentFiles(parsedTorrent.files || [])
              completeItem(index, {
                identity,
                uid: file.uid,
                sourceName: file.name,
                name: parsedTorrent.name || file.name,
                length: parsedTorrent.length || files.reduce((total, item) => {
                  return total + item.length
                }, 0),
                files,
                torrent,
                selectFile: previousItem
                  ? previousItem.selectFile
                  : SELECTED_ALL_FILES,
                valid: true
              })
            }, () => {
              completeItem(index, invalidItem)
            })
          })
        })
      },
      showInvalidSingleTorrent (file = {}) {
        const identity = `file:${getTorrentFileKey(file)}`
        this.forceBatchMode = true
        this.batchTorrentItems = [{
          identity,
          uid: file.uid,
          sourceName: file.name,
          name: file.name || this.$t('task.torrent-task'),
          length: 0,
          files: [],
          torrent: EMPTY_STRING,
          selectFile: NONE_SELECTED_FILES,
          valid: false
        }]
        this.activeBatchTorrentKeys = []
        this.$emit('loading-change', false)
        this.$emit('change', EMPTY_STRING, NONE_SELECTED_FILES, [])
      },
      reset () {
        this.name = EMPTY_STRING
        this.currentTorrent = EMPTY_STRING
        this.batchTorrentItems = []
        this.activeBatchTorrentKeys = []
        this.forceBatchMode = false
        this.files = []
        if (this.$refs.torrentFileList) {
          this.$refs.torrentFileList.clearSelection()
        }
        this.$emit('loading-change', false)
        this.$emit('change', EMPTY_STRING, NONE_SELECTED_FILES, [])
      },
      handleChange (file, fileList) {
        this.$store.dispatch('app/addTaskAddTorrents', { fileList })
      },
      handleExceed (files) {
        const fileList = buildFileList(Array.from(files))
        this.$store.dispatch('app/appendTaskAddTorrents', { fileList })
      },
      handleTrashClick () {
        this.$store.dispatch('app/addTaskAddTorrents', { fileList: [] })
      },
      restoreBatchFileSelections () {
        const validItems = this.batchTorrentItems.filter(item => item.valid)
        const fileLists = this.$refs.batchTorrentFileLists || []
        const refs = Array.isArray(fileLists) ? fileLists : [fileLists]
        validItems.forEach((item, index) => {
          const fileList = refs[index]
          if (!fileList) {
            return
          }

          if (item.selectFile === SELECTED_ALL_FILES) {
            fileList.toggleSelection(item.files)
            return
          }
          if (item.selectFile === NONE_SELECTED_FILES) {
            fileList.clearSelection()
            return
          }

          const selectedIndexes = item.selectFile.split(',')
          const selectedFiles = item.files.filter(file => {
            return selectedIndexes.includes(String(file.idx))
          })
          fileList.toggleSelection(selectedFiles)
        })
        this.emitBatchChange()
      },
      handleBatchFileSelectionChange (torrentItem, selectedFileIndex) {
        torrentItem.selectFile = selectedFileIndex
        this.emitBatchChange()
      },
      emitBatchChange () {
        const torrents = this.batchTorrentItems
          .filter(item => item.valid)
          .map(item => ({
            torrent: item.torrent,
            selectFile: item.selectFile
          }))
        this.$emit(
          'change',
          EMPTY_STRING,
          SELECTED_ALL_FILES,
          torrents
        )
      },
      handleSelectionChange (val) {
        const { currentTorrent } = this
        this.$emit('change', currentTorrent, val)
      }
    }
  }
</script>

<style lang="scss">
.upload-torrent {
  width: 100%;
  .el-upload, .el-upload-dragger {
    width: 100%;
  }
  .el-upload-dragger {
    border-radius: 4px;
    padding: 24px;
    height: auto;
  }
  .upload-inbox-icon {
    display: inline-block;
    margin-bottom: 12px;
  }
  .torrent-name {
    margin-top: 4px;
    font-size: $--font-size-small;
    color: $--color-text-secondary;
    line-height: 16px;
  }
}
.selective-torrent {
  .torrent-name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .torrent-info {
    margin-bottom: 15px;
    font-size: 12px;
    line-height: 16px;
  }
  .batch-torrent-list {
    max-height: 420px;
    overflow-y: auto;
  }
  .batch-torrent-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .batch-torrent-summary {
    flex: none;
    margin: 0 12px;
    color: $--color-text-secondary;
  }
  .invalid-torrent {
    color: $--color-text-placeholder;
  }
  .invalid-torrent-mark {
    margin-left: 6px;
    color: $--color-danger;
  }
  .torrent-actions {
    text-align: right;
    line-height: 16px;
    &> span {
      cursor: pointer;
      display: inline-block;
      vertical-align: middle;
      height: 14px;
      padding: 1px;
    }
  }
}
</style>
