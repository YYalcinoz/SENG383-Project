import { timeOf } from '../utils/events.js'
import { formatDay, weekDays } from '../utils/week.js'
import './WeekDays.css'

// Bir haftanın günleri, Pazartesi'den Pazar'a; her günün altında o günün etkinlikleri
// (saat ve başlık). Haftalık program sayfasında ve çocuğun program sayfasında kullanılır.
//
// events: o haftanın etkinlikleri, byDateAndTime ile sıralı
// showEmptyDays: false ise etkinliği olmayan günler hiç gösterilmez
// dayHeading: günlerin başlık seviyesi; sayfanın başlık sırası atlanmasın diye ayarlanabilir
export default function WeekDays({ weekStart, events, showEmptyDays = true, dayHeading: DayHeading = 'h4' }) {
  const days = weekDays(weekStart)
    .map((day) => ({ day, events: events.filter((e) => e.eventDate === day) }))
    .filter(({ events: dayEvents }) => showEmptyDays || dayEvents.length > 0)

  return (
    <ol className="week-days">
      {days.map(({ day, events: dayEvents }) => (
        <li key={day} className="week-day" aria-labelledby={`day-${day}`}>
          <DayHeading id={`day-${day}`}>{formatDay(day)}</DayHeading>
          {dayEvents.length === 0 ? (
            <p className="no-events">No events</p>
          ) : (
            <ul className="event-list">
              {dayEvents.map((e) => (
                <li key={e.id}>
                  <span className="event-time">{timeOf(e)}</span>
                  {/* Düz metin olarak gösterilir, HTML olarak eklenmez */}
                  <span className="event-title">{e.title}</span>
                  <span className="event-type">{e.eventType}</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  )
}
