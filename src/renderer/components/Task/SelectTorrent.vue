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
        <div v-if="isBatch" class="batch-torrent-list">
          <div
            class="batch-torrent-name"
            v-for="torrent in torrents"
            :key="torrent.uid"
            :title="torrent.name"
          >
            {{ torrent.name }}
          </div>
        </div>
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
        return this.torrents.length > 1
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
          return
        }

        remote(file.raw, { timeout: 60 * 1000 }, (err, parsedTorrent) => {
          if (err) throw err
          if (this.torrents !== fileList) {
            return
          }
          console.log('[Motrix] parsed torrent: ', parsedTorrent)
          this.files = listTorrentFiles(parsedTorrent.files)
          this.$refs.torrentFileList.toggleAllSelection()

          getAsBase64(file.raw, (torrent) => {
            if (this.torrents !== fileList) {
              return
            }
            this.name = file.name
            this.currentTorrent = torrent
            this.$emit('change', torrent, SELECTED_ALL_FILES)
          })
        })
      }
    },
    methods: {
      loadBatchTorrents (fileList) {
        const invalidFile = fileList.find(file => !file.raw)
        if (invalidFile) {
          this.$store.dispatch('app/addTaskAddTorrents', { fileList: [] })
          this.$msg.error(this.$t('task.select-torrent'))
          return
        }

        const torrents = new Array(fileList.length)
        let loaded = 0
        this.$emit('loading-change', true)
        fileList.forEach((file, index) => {
          getAsBase64(file.raw, (torrent) => {
            if (this.torrents !== fileList) {
              return
            }

            torrents[index] = torrent
            loaded += 1
            if (loaded === fileList.length) {
              this.$emit('loading-change', false)
              this.$emit(
                'change',
                EMPTY_STRING,
                SELECTED_ALL_FILES,
                torrents
              )
            }
          }, () => {
            if (this.torrents !== fileList) {
              return
            }

            this.$store.dispatch('app/addTaskAddTorrents', { fileList: [] })
            this.$msg.error(`${file.name}: ${this.$t('task.select-torrent')}`)
          })
        })
      },
      reset () {
        this.name = EMPTY_STRING
        this.currentTorrent = EMPTY_STRING
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
        this.$store.dispatch('app/addTaskAddTorrents', { fileList })
      },
      handleTrashClick () {
        this.$store.dispatch('app/addTaskAddTorrents', { fileList: [] })
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
  .batch-torrent-name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .batch-torrent-list {
    max-height: 120px;
    overflow-y: auto;
  }
  .torrent-info {
    margin-bottom: 15px;
    font-size: 12px;
    line-height: 16px;
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
