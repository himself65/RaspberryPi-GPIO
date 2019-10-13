import fs = require('fs')
import child_process = require('child_process')
import { ExecException } from 'child_process'

const gpioAdmin = 'gpio-admin'
const sysFsPathOld = '/sys/devices/virtual/gpio' // pre 3.18.x kernel
const sysFsPathNew = '/sys/class/gpio' // post 3.18.x kernel
let sysFsPath: string

// tests the device tree directory to determine the actual gpio path
if (fs.existsSync(sysFsPathNew)) {
  sysFsPath = sysFsPathNew
} else {
  sysFsPath = sysFsPathOld // fallback for old kernels
}

// https://pinout.xyz
const pinMapping: {
  [key: string]: number | undefined
} = {
  '3': 8,
  '5': 9,
  '7': 7,
  '8': 14,
  '10': 16,
  '11': 0,
  '12': 1,
  '13': 2,
  '15': 3,
  '16': 4,
  '18': 5,
  '19': 12,
  '21': 13,
  '22': 6,
  '23': 14,
  '24': 10,
  '26': 11,
  '27': 30,
  '28': 31,
  '29': 21,
  '31': 22,
  '32': 26,
  '33': 23,
  '35': 24,
  '36': 27,
  '37': 25,
  '38': 28,
  '40': 29
}

function isNumber (number: string | number | undefined | null): boolean {
  if (typeof number === 'number') {
    return true
  } else if (number == null) {
    return false
  }
  return !isNaN(parseInt(number, 10))
}

const noop = () => {}

function handleExecResponse (method: string, pinNumber: number, callback: Function) {
  return (err: NodeJS.ErrnoException | null, stdout: string, stderr: string) => {
    if (err) {
      console.error('Error when trying to', method, 'pin', pinNumber)
      console.error(stderr)
      callback(err)
    } else {
      callback()
    }
  }
}

function sanitizePinNumber (pinNumber: string | number) {
  const num = String(pinNumber)
  if (!isNumber(pinNumber) || !isNumber(pinMapping[num])) {
    throw new Error('Pin number isn\'t valid')
  }

  return parseInt(num, 10)
}

function sanitizeDirection (direction: string) {
  direction = (direction || '').toLowerCase().trim()
  if (direction === 'in' || direction === 'input') {
    return 'in'
  } else if (direction === 'out' || direction === 'output' || !direction) {
    return 'out'
  } else {
    throw new Error('Direction must be \'input\' or \'output\'')
  }
}

function sanitizeOptions (options: string): {
  direction: 'in' | 'out',
  pull: 'pullup' | 'pulldown' | ''
} {
  // @ts-ignore
  const sanitized: {
    direction: 'in' | 'out',
    pull: 'pullup' | 'pulldown' | ''
  } = {}

  options.split(' ').forEach((token) => {
    if (token == 'in' || token == 'input') {
      sanitized.direction = 'in'
    }

    if (token == 'pullup' || token == 'up') {
      sanitized.pull = 'pullup'
    }

    if (token == 'pulldown' || token == 'down') {
      sanitized.pull = 'pulldown'
    }
  })

  if (sanitized.direction == null) {
    sanitized.direction = 'out'
  }

  if (sanitized.pull == null) {
    sanitized.pull = ''
  }

  return sanitized
}

type Direction = 'in' | 'out' | 'output' | 'input'

export = {
  open: function (pinNumber: number, options: string, callback: (err: NodeJS.ErrnoException | null) => void) {
    pinNumber = sanitizePinNumber(pinNumber)

    if (!callback && typeof options === 'function') {
      callback = options
      options = 'out'
    }

    const _options = sanitizeOptions(options)

    child_process.exec(gpioAdmin + ' export ' + pinMapping[String(pinNumber)] + ' ' + _options.pull,
      { encoding: 'utf-8' },
      // @ts-ignore
      handleExecResponse(
        'open',
        pinNumber,
        (err?: NodeJS.ErrnoException | null) => {
          if (err) return (callback || noop)(err)

          exports.setDirection(pinNumber, _options.direction, callback)
        }))
  },

  setDirection: function (pinNumber: number, direction: Direction, callback?: (err: NodeJS.ErrnoException | null) => void) {
    pinNumber = sanitizePinNumber(pinNumber)
    direction = sanitizeDirection(direction)

    fs.writeFile(sysFsPath + '/gpio' + pinMapping[pinNumber] + '/direction', direction, (callback || noop))
  },

  getDirection: function (pinNumber: number, callback?: (err: NodeJS.ErrnoException | null, direction?: Direction) => void) {
    pinNumber = sanitizePinNumber(pinNumber)
    const cb = (callback || noop)
    fs.readFile(sysFsPath + '/gpio' + pinMapping[pinNumber] + '/direction', 'utf8', function (err, direction) {
      if (err) return cb(err)
      cb(null, sanitizeDirection(direction.trim()))
    })
  },

  close: function (pinNumber: number, callback?: Function) {
    pinNumber = sanitizePinNumber(pinNumber)

    child_process.exec(gpioAdmin + ' unexport ' + pinMapping[pinNumber],
      { encoding: 'utf-8' },
      // @ts-ignore
      handleExecResponse('close', pinNumber, callback || noop)
    )
  },

  read: function (pinNumber: number, callback?: Function) {
    pinNumber = sanitizePinNumber(pinNumber)

    fs.readFile(sysFsPath + '/gpio' + pinMapping[pinNumber] + '/value', (err, data) => {
      if (err) return (callback || noop)
      (err);

      (callback || noop)(null, parseInt(data.toString(), 10))
    })
  },

  write: function (pinNumber: number, value: 0 | 1 | '1' | '0' | boolean, callback?: (err: NodeJS.ErrnoException | null) => void) {
    pinNumber = sanitizePinNumber(pinNumber)

    value = !!value ? '1' : '0'

    fs.writeFile(
      sysFsPath + '/gpio' + pinMapping[pinNumber] + '/value',
      value,
      'utf8',
      (callback || noop))
  }
}
