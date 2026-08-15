<template>
  <div v-if="false"></div>
</template>

<script>
  import { ADD_TASK_TYPE } from '@shared/constants'
  import { buildFileList } from '@shared/utils'

  export default {
    name: 'mo-dragger',
    mounted () {
      this.preventDefault = ev => ev.preventDefault()
      let count = 0
      this.onDragEnter = (ev) => {
        if (count === 0) {
          this.$store.dispatch('app/showAddTaskDialog', ADD_TASK_TYPE.TORRENT)
        }
        count++
      }

      this.onDragLeave = (ev) => {
        count--
        if (count === 0) {
          this.$store.dispatch('app/hideAddTaskDialog')
        }
      }

      this.onDrop = (ev) => {
        count = 0

        const torrentFiles = [...ev.dataTransfer.files]
          .filter(item => /\.torrent$/i.test(item.name))
        const fileList = buildFileList(torrentFiles)
        if (!fileList.length) {
          this.$msg.error(this.$t('task.select-torrent'))
          return
        }

        this.$store.dispatch('app/appendTaskAddTorrents', { fileList })
      }

      document.addEventListener('dragover', this.preventDefault)
      document.body.addEventListener('dragenter', this.onDragEnter)
      document.body.addEventListener('dragleave', this.onDragLeave)
      document.body.addEventListener('drop', this.onDrop)
    },
    destroyed () {
      document.removeEventListener('dragover', this.preventDefault)
      document.body.removeEventListener('dragenter', this.onDragEnter)
      document.body.removeEventListener('dragleave', this.onDragLeave)
      document.body.removeEventListener('drop', this.onDrop)
    }
  }
</script>
